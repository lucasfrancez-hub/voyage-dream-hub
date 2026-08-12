import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import {
  assertAdmin,
  mapBillStatus,
  onlyDigits,
  parseBoletoLine,
  parseBoletoCode,
  classificarErroBoleto,
  BILL_STATUS_LABEL,
  todayBRT,
  isBoletoVencido,
  isStatusAtivo,
  buildIdempotencyKey,
  resolverValorPagamento,
} from './boleto-pay.helpers'

export type ErroBoleto = {
  titulo: string
  mensagem: string
  codigo: string | null
  tecnico: string | null
  orientacao: string | null
}


function ip() {
  try {
    return (
      getRequestHeader('cf-connecting-ip') ||
      getRequestHeader('x-forwarded-for') ||
      null
    )
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------
 * 1) Leitura automática do boleto (IA no backend) + validação ASAAS
 * ------------------------------------------------------------------ */

export const lerBoleto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().min(1).max(400).optional(),
        base64: z.string().min(1).max(20_000_000).optional(),
        mimeType: z.string().max(120).optional(),
        valorInformado: z.number().optional().nullable(),
        vencimentoInformado: z.string().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    let base64 = data.base64 ?? ''
    let mime = data.mimeType || 'application/pdf'

    if (!base64 && data.path) {
      const dl = await supabaseAdmin.storage.from('boleto-documents').download(data.path)
      if (dl.error || !dl.data) throw new Error('Não foi possível abrir o boleto anexado.')
      const buf = Buffer.from(await dl.data.arrayBuffer())
      base64 = buf.toString('base64')
      mime = (dl.data as any).type || mime
    }
    if (!base64) throw new Error('Envie o arquivo do boleto.')

    const key = process.env['LOVABLE_API_KEY']
    if (!key) throw new Error('IA indisponível no momento.')

    const dataUrl = `data:${mime};base64,${base64}`
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content:
              'Você extrai dados de boletos bancários brasileiros. Responda SOMENTE JSON válido com as chaves: linha_digitavel (somente dígitos), codigo_barras, valor (number), vencimento (yyyy-mm-dd), beneficiario, documento_beneficiario. Use null quando não encontrar.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extraia os dados deste boleto.' },
              mime.includes('pdf')
                ? { type: 'file', file: { filename: 'boleto.pdf', file_data: dataUrl } }
                : { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      console.error('[lerBoleto] IA falhou', res.status, t.slice(0, 300))
      throw new Error('Não foi possível ler o boleto automaticamente. Informe a linha digitável manualmente.')
    }
    const j: any = await res.json()
    const raw = j?.choices?.[0]?.message?.content ?? '{}'
    let parsed: any = {}
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      parsed = {}
    }

    const linha = onlyDigits(parsed?.linha_digitavel || parsed?.codigo_barras || '')
    const local = parseBoletoLine(linha)

    let simulacao: any = null
    let simulacaoErro: string | null = null
    if (linha.length >= 44) {
      try {
        const { simulateAsaasBill } = await import('@/lib/asaas.server')
        simulacao = await simulateAsaasBill(linha)
      } catch (e) {
        simulacaoErro = (e as Error).message
      }
    }

    const valorBoleto =
      Number(simulacao?.value ?? simulacao?.totalValue ?? parsed?.valor ?? local.value ?? 0) || null
    const vencBoleto: string | null =
      simulacao?.dueDate || parsed?.vencimento || local.dueDate || null
    const beneficiario: string | null =
      simulacao?.companyName || simulacao?.beneficiaryName || parsed?.beneficiario || null

    const divergencias: string[] = []
    if (data.valorInformado && valorBoleto && Math.abs(data.valorInformado - valorBoleto) > 0.01) {
      divergencias.push(
        `Valor informado (R$ ${data.valorInformado.toFixed(2)}) diferente do boleto (R$ ${valorBoleto.toFixed(2)}).`,
      )
    }
    if (data.vencimentoInformado && vencBoleto && data.vencimentoInformado !== vencBoleto) {
      divergencias.push(
        `Vencimento informado (${data.vencimentoInformado}) diferente do boleto (${vencBoleto}).`,
      )
    }

    return {
      linhaDigitavel: linha || null,
      codigoBarras: onlyDigits(parsed?.codigo_barras || '') || null,
      valor: valorBoleto,
      vencimento: vencBoleto,
      beneficiario,
      documentoBeneficiario: parsed?.documento_beneficiario ?? null,
      desconto: simulacao?.discount ?? null,
      juros: simulacao?.interest ?? null,
      multa: simulacao?.fine ?? null,
      valorTotal: simulacao?.totalValue ?? valorBoleto,
      validadoPeloAsaas: Boolean(simulacao),
      simulacaoErro,
      vencido: isBoletoVencido(vencBoleto),
      divergencias,
      hoje: todayBRT(),
    }
  })

/* ------------------------------------------------------------------
 * 1.b) Consulta do boleto ANTES de pagar (fluxo de banco)
 * ------------------------------------------------------------------ */

/** Procura pagamentos ativos do mesmo título (linha, barcode ou lançamento). */
async function buscarDuplicidade(
  supabaseAdmin: any,
  linha: string,
  barcode: string | null,
  financialEntryId?: string | null,
) {
  const ativos = ['pendente', 'agendado', 'processando', 'pago']
  const ors = [`identification_field.eq.${linha}`]
  if (barcode && barcode !== linha) ors.push(`identification_field.eq.${barcode}`)
  if (financialEntryId) ors.push(`financial_entry_id.eq.${financialEntryId}`)
  const { data } = await supabaseAdmin
    .from('asaas_bill_payments')
    .select('id, status, value, scheduled_date, effective_date, asaas_bill_id, created_at')
    .in('status', ativos)
    .or(ors.join(','))
    .order('created_at', { ascending: false })
    .limit(1)
  return (data && data[0]) || null
}

export const consultarBoleto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(20).max(80),
        financialEntryId: z.string().uuid().nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)

    const parsed = parseBoletoCode(data.code)
    if (!parsed.valid || !parsed.linha) {
      return {
        ok: false as const,
        podePagar: false,
        erro: {
          titulo: 'Código inválido',
          mensagem: parsed.message ?? 'Não foi possível validar o código informado.',
          codigo: 'formato_invalido',
          tecnico: null,
          orientacao: 'Confira a linha digitável ou o código de barras e digite novamente.',
        } satisfies ErroBoleto,
      }
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const dup = await buscarDuplicidade(
      supabaseAdmin,
      parsed.linha,
      parsed.barcode,
      data.financialEntryId ?? null,
    )
    if (dup) {
      return {
        ok: false as const,
        podePagar: false,
        duplicidade: dup,
        erro: {
          titulo: 'Pagamento já existente para este boleto',
          mensagem: `Já existe um pagamento ${
            BILL_STATUS_LABEL[dup.status] ?? dup.status
          } para este título em nosso sistema.`,
          codigo: 'duplicidade',
          tecnico: JSON.stringify(dup),
          orientacao:
            'Confirme o status do pagamento anterior na tela de Pagamentos. Cancele-o antes de criar outro.',
        } satisfies ErroBoleto,
      }
    }

    const { simulateAsaasBillSafe } = await import('@/lib/asaas.server')
    const sim = await simulateAsaasBillSafe(parsed.linha)

    if (!sim.ok) {
      const cls = classificarErroBoleto(sim.description, sim.code)
      return {
        ok: false as const,
        podePagar: false,
        boleto: {
          linhaDigitavel: parsed.linha,
          codigoBarras: parsed.barcode,
          valorOriginal: parsed.value,
          vencimento: parsed.dueDate,
        },
        erro: {
          titulo: cls.titulo,
          mensagem: sim.description,
          codigo: sim.code ?? (sim.status ? String(sim.status) : null),
          tecnico: JSON.stringify(sim.raw ?? {}).slice(0, 2000),
          orientacao:
            'Verifique a situação do título com o beneficiário. Não é possível prosseguir com o pagamento.',
        } satisfies ErroBoleto,
      }
    }

    const s: any = sim.data ?? {}
    const valorOriginal = Number(s.value ?? parsed.value ?? 0) || null
    const valorFinal = Number(s.totalValue ?? s.value ?? parsed.value ?? 0) || null
    const vencimento: string | null = s.dueDate ?? parsed.dueDate ?? null
    // Valor só é editável quando o próprio provedor indicar título de valor aberto.
    const valorEditavel = Boolean(
      s.canChangeValue ?? (valorOriginal == null && (s.minimumValue != null || s.maximumValue != null)),
    )

    return {
      ok: true as const,
      podePagar: true,
      boleto: {
        tipo: parsed.kind,
        linhaDigitavel: parsed.linha,
        codigoBarras: s.barCode ?? parsed.barcode,
        beneficiario: s.companyName ?? s.beneficiaryName ?? null,
        documentoBeneficiario: s.cpfCnpj ?? s.beneficiaryCpfCnpj ?? null,
        instituicao: s.bankName ?? s.bank?.name ?? null,
        valorOriginal,
        valorAtualizado: valorFinal,
        valorFinal,
        juros: s.interest ?? null,
        multa: s.fine ?? null,
        desconto: s.discount ?? null,
        abatimento: s.deduction ?? s.rebate ?? null,
        vencimento,
        vencido: isBoletoVencido(vencimento),
        descricao: s.description ?? s.additionalInformation ?? null,
        valorEditavel,
        valorMinimo: s.minimumValue ?? null,
        valorMaximo: s.maximumValue ?? null,
        dataMinimaPagamento: s.minimumPaymentDate ?? null,
        dataMaximaPagamento: s.maximumPaymentDate ?? s.dueDateLimit ?? null,
        podePagarComSaldo: s.canBePaidWithBalance ?? null,
        hoje: todayBRT(),
      },
      raw: s,
    }
  })

/* ------------------------------------------------------------------
 * 2) Criação/agendamento do pagamento

 * ------------------------------------------------------------------ */

export const criarPagamentoBoleto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        financialEntryId: z.string().uuid().nullable().optional(),
        identificationField: z.string().min(20).max(60),
        value: z.number().positive(),
        dueDate: z.string().nullable().optional(),
        scheduleDate: z.string().nullable().optional(),
        scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
        description: z.string().max(300).nullable().optional(),
        beneficiaryName: z.string().max(200).nullable().optional(),
        beneficiaryDocument: z.string().max(40).nullable().optional(),
        boletoPath: z.string().max(400).nullable().optional(),
        /** Identificador da tentativa gerado no clique — bloqueia duplo clique/refresh. */
        clientRequestId: z.string().uuid(),
        confirmado: z.literal(true),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { simulateAsaasBillSafe, createAsaasBillSafe } = await import('@/lib/asaas.server')

    const erro = (e: ErroBoleto) => ({ ok: false as const, erro: e })

    // ---- Idempotência: mesma tentativa (duplo clique, refresh, retry) ----
    const { criarRegistroIdempotente } = await import('./boleto-pay.idempotency')
    const repo = {
      buscarPorClientRequestId: async (id: string) =>
        (
          await supabaseAdmin
            .from('asaas_bill_payments')
            .select('*')
            .eq('client_request_id', id)
            .maybeSingle()
        ).data,
      buscarPorIdempotencyKey: async (key: string) =>
        (
          await supabaseAdmin
            .from('asaas_bill_payments')
            .select('*')
            .eq('idempotency_key', key)
            .maybeSingle()
        ).data,
      inserir: async (r: Record<string, any>) => {
        const res = await supabaseAdmin.from('asaas_bill_payments').insert(r as any).select('*').single()
        if (res.error) throw res.error
        return res.data
      },
    }
    const reaproveitado = await repo.buscarPorClientRequestId(data.clientRequestId)
    if (reaproveitado) {
      return {
        ok: true as const,
        id: reaproveitado.id,
        asaasBillId: reaproveitado.asaas_bill_id,
        status: reaproveitado.status,
        scheduledDate: reaproveitado.scheduled_date,
        reaproveitado: true as const,
      }
    }

    const parsed = parseBoletoCode(data.identificationField)
    if (!parsed.valid || !parsed.linha) {
      return erro({
        titulo: 'Código inválido',
        mensagem: parsed.message ?? 'Código de barras inválido.',
        codigo: 'formato_invalido',
        tecnico: null,
        orientacao: 'Confira o código e tente novamente.',
      })
    }
    const linha = parsed.linha

    // Duplicidade: mesma linha, mesmo código de barras ou mesmo lançamento
    const dup = await buscarDuplicidade(supabaseAdmin, linha, parsed.barcode, data.financialEntryId)
    if (dup) {
      return erro({
        titulo: 'Pagamento já existente para este boleto',
        mensagem: `Já existe um pagamento ${BILL_STATUS_LABEL[dup.status] ?? dup.status} para este título.`,
        codigo: 'duplicidade',
        tecnico: JSON.stringify(dup),
        orientacao: 'Confirme o status do pagamento anterior antes de tentar novamente.',
      })
    }

    // Revalidação obrigatória no provedor antes de pagar
    const simRes = await simulateAsaasBillSafe(linha)
    if (!simRes.ok) {
      const cls = classificarErroBoleto(simRes.description, simRes.code)
      return erro({
        titulo: cls.titulo,
        mensagem: simRes.description,
        codigo: simRes.code ?? String(simRes.status || ''),
        tecnico: JSON.stringify(simRes.raw ?? {}).slice(0, 2000),
        orientacao: 'Verifique a situação do título com o beneficiário.',
      })
    }
    const sim: any = simRes.data ?? {}

    // O valor pago é sempre o do provedor — o frontend não pode alterá-lo.
    const valorAsaas = Number(sim?.value ?? sim?.totalValue ?? 0) || null
    const valorEditavel = Boolean(sim?.canChangeValue)
    const resolvido = resolverValorPagamento({
      valorProvedor: valorAsaas,
      valorInformado: data.value,
      valorEditavel,
      minimo: sim?.minimumValue ?? null,
      maximo: sim?.maximumValue ?? null,
    })
    if (!resolvido.ok) {
      return erro({
        titulo: 'Valor divergente',
        mensagem: `O valor deste boleto é ${resolvido.valorProvedor.toFixed(2)} e não pode ser alterado (informado ${resolvido.valorInformado.toFixed(2)}).`,
        codigo: 'valor_divergente',
        tecnico: JSON.stringify(resolvido),
        orientacao: 'Refaça a consulta do boleto para atualizar os valores.',
      })
    }
    const valorFinal = resolvido.valor

    const venc = (sim?.dueDate as string | undefined) || data.dueDate || null
    let schedule = data.scheduleDate || null
    const hoje = todayBRT()

    // Validação da data escolhida
    if (schedule) {
      if (schedule < hoje) {
        return erro({
          titulo: 'Data de pagamento inválida',
          mensagem: `Não é possível agendar para uma data passada (${schedule}).`,
          codigo: 'data_passada',
          tecnico: null,
          orientacao: 'Escolha hoje ou uma data futura.',
        })
      }
      const dMin: string | null = sim?.minimumPaymentDate ?? null
      const dMax: string | null = sim?.maximumPaymentDate ?? sim?.dueDateLimit ?? null
      if (dMin && schedule < dMin) {
        return erro({
          titulo: 'Pagamento não permitido para esta data',
          mensagem: `Este título só pode ser pago a partir de ${dMin}.`,
          codigo: 'data_minima',
          tecnico: JSON.stringify({ dMin, schedule }),
          orientacao: 'Ajuste a data do pagamento.',
        })
      }
      if (dMax && schedule > dMax) {
        return erro({
          titulo: 'Pagamento não permitido para esta data',
          mensagem: `Data limite para pagamento: ${dMax}.`,
          codigo: 'data_maxima',
          tecnico: JSON.stringify({ dMax, schedule }),
          orientacao: 'Ajuste a data do pagamento.',
        })
      }
    }

    // Agendamento com HORA: o ASAAS só aceita data, então seguramos localmente
    // e o cron dispara no horário exato (America/Sao_Paulo).
    const { brtToIso } = await import('@/lib/financial-dispatch.server')
    const scheduledAt =
      schedule && data.scheduleTime ? brtToIso(schedule, data.scheduleTime) : null
    const segurarLocal = !!scheduledAt && new Date(scheduledAt!).getTime() > Date.now()
    if (schedule && schedule <= hoje && !segurarLocal) schedule = null
    if (schedule && isBoletoVencido(venc)) {
      return erro({
        titulo: 'Data de pagamento inválida',
        mensagem: 'Este boleto está vencido — o pagamento não pode ser agendado para uma data futura.',
        codigo: 'vencido_agendamento',
        tecnico: JSON.stringify({ venc, schedule }),
        orientacao: 'Escolha "Pagar agora" para liquidar o título hoje.',
      })
    }

    const quando = scheduledAt ?? schedule ?? 'now'
    const idem = buildIdempotencyKey(linha, quando)
    const externalRef = `bill:${data.clientRequestId}`

    const montarRow = (idempotencyKey: string) => ({
        financial_entry_id: data.financialEntryId ?? null,
        identification_field: linha,
        beneficiary_name: data.beneficiaryName ?? (sim?.companyName as string | undefined) ?? null,
        beneficiary_document: data.beneficiaryDocument ?? sim?.cpfCnpj ?? null,
        value: valorFinal,

        discount: sim?.discount ?? null,
        interest: sim?.interest ?? null,
        fine: sim?.fine ?? null,
        due_date: venc,
        scheduled_date: schedule,
        scheduled_at: segurarLocal ? scheduledAt : null,
        dispatch_pending: segurarLocal,
        status: segurarLocal ? 'agendado' : 'pendente',
        boleto_path: data.boletoPath ?? null,
        description: data.description ?? null,
        external_reference: externalRef,
        idempotency_key: idempotencyKey,
        client_request_id: data.clientRequestId,
        raw_simulation: sim as any,
        created_by: context.userId,
        created_by_name: (context as any).claims?.email ?? null,
        created_ip: ip(),
      })

    const reg = await criarRegistroIdempotente(repo, {
      clientRequestId: data.clientRequestId,
      linha,
      quando,
      montarRow,
    })
    if (reg.tipo === 'reaproveitado') {
      return {
        ok: true as const,
        id: reg.row.id,
        asaasBillId: reg.row.asaas_bill_id ?? null,
        status: reg.row.status,
        scheduledDate: reg.row.scheduled_date ?? null,
        reaproveitado: true as const,
      }
    }
    const row: any = reg.row


    if (segurarLocal) {
      await supabaseAdmin.from('asaas_bill_payment_events').insert({
        bill_payment_id: row.id,
        event: 'agendado',
        status: 'agendado',
        actor_user_id: context.userId,
        ip: ip(),
        payload: { scheduledAt } as any,
      })
      if (data.financialEntryId) {
        await supabaseAdmin
          .from('financial_entries')
          .update({
            bill_payment_status: 'agendado',
            boleto_line: linha,
            boleto_beneficiary: row.beneficiary_name,
            payment_method: 'Boleto (ASAAS)',
          })
          .eq('id', data.financialEntryId)
      }
      return {
        ok: true as const,
        id: row.id,
        asaasBillId: null as string | null,
        status: 'agendado',
        scheduledDate: schedule,
      }
    }

    const billRes = await createAsaasBillSafe({
      identificationField: linha,
      scheduleDate: schedule,
      description: data.description ?? null,
      externalReference: externalRef,
    })

    // ---- Resposta perdida / timeout: NUNCA reenviar às cegas ----
    if (!billRes.ok && (billRes.code === 'network_error' || billRes.status === 0 || billRes.status >= 500)) {
      const { findAsaasBillsByExternalReference } = await import('@/lib/asaas.server')
      const rec = await findAsaasBillsByExternalReference(externalRef)
      const achado = rec.ok ? rec.bills[0] : null
      if (achado) {
        const st = mapBillStatus(achado?.status)
        await supabaseAdmin
          .from('asaas_bill_payments')
          .update({
            asaas_bill_id: achado?.id ?? null,
            status: st,
            scheduled_date: achado?.scheduleDate ?? schedule,
            effective_date: achado?.paymentDate ?? null,
            raw_response: achado as any,
            needs_reconciliation: false,
            reconciled_at: new Date().toISOString(),
          } as any)
          .eq('id', row.id)
        await supabaseAdmin.from('asaas_bill_payment_events').insert({
          bill_payment_id: row.id,
          asaas_bill_id: achado?.id ?? null,
          event: 'reconciliado',
          status: st,
          message: 'Resposta perdida no envio; pagamento localizado no banco pela referência.',
          actor_user_id: context.userId,
          ip: ip(),
          payload: achado as any,
        })
        return {
          ok: true as const,
          id: row.id,
          asaasBillId: (achado?.id ?? null) as string | null,
          status: st,
          scheduledDate: achado?.scheduleDate ?? schedule,
          reconciliado: true as const,
        }
      }
      await supabaseAdmin
        .from('asaas_bill_payments')
        .update({
          status: 'processando',
          needs_reconciliation: true,
          fail_reason: billRes.description,
        } as any)
        .eq('id', row.id)
      await supabaseAdmin.from('asaas_bill_payment_events').insert({
        bill_payment_id: row.id,
        event: 'sem_resposta',
        status: 'processando',
        message: `Sem confirmação do banco: ${billRes.description}. Nenhum reenvio automático foi feito.`,
        actor_user_id: context.userId,
        ip: ip(),
        payload: billRes.raw as any,
      })
      return erro({
        titulo: 'Sem confirmação do banco',
        mensagem:
          'Não recebemos a confirmação do banco para este envio. O pagamento ficou em verificação e NÃO foi reenviado.',
        codigo: billRes.code ?? 'sem_resposta',
        tecnico: billRes.description,
        orientacao:
          'Use o botão Atualizar na tela de Pagamentos em alguns minutos: o sistema consulta o banco pela referência e confirma se o pagamento existe antes de qualquer nova tentativa.',
      })
    }

    if (!billRes.ok) {
      const cls = classificarErroBoleto(billRes.description, billRes.code)
      const msg = billRes.description
      await supabaseAdmin
        .from('asaas_bill_payments')
        .update({ status: 'falhou', fail_reason: msg })
        .eq('id', row.id)
      await supabaseAdmin.from('asaas_bill_payment_events').insert({
        bill_payment_id: row.id,
        event: 'erro',
        status: 'falhou',
        message: msg,
        actor_user_id: context.userId,
        ip: ip(),
        payload: billRes.raw as any,
      })
      if (data.financialEntryId) {
        await supabaseAdmin
          .from('financial_entries')
          .update({ bill_payment_status: 'falhou' })
          .eq('id', data.financialEntryId)
      }
      return erro({
        titulo: cls.titulo === 'Consulta recusada' ? 'Pagamento não autorizado' : cls.titulo,
        mensagem: msg,
        codigo: billRes.code ?? String(billRes.status || ''),
        tecnico: JSON.stringify(billRes.raw ?? {}).slice(0, 2000),
        orientacao: 'O pagamento foi registrado como falhou. Nenhum valor foi debitado.',
      })
    }

    const bill: any = billRes.data ?? {}
    const status = mapBillStatus(bill?.status)
    await supabaseAdmin
      .from('asaas_bill_payments')
      .update({
        asaas_bill_id: bill?.id ?? null,
        status,
        scheduled_date: bill?.scheduleDate ?? schedule,
        effective_date: bill?.paymentDate ?? null,
        raw_response: bill as any,
      })
      .eq('id', row.id)

    await supabaseAdmin.from('asaas_bill_payment_events').insert({
      bill_payment_id: row.id,
      asaas_bill_id: bill?.id ?? null,
      event: schedule ? 'agendado' : 'enviado',
      status,
      actor_user_id: context.userId,
      ip: ip(),
      payload: bill as any,
    })

    if (data.financialEntryId) {
      await supabaseAdmin
        .from('financial_entries')
        .update({
          bill_payment_status: status,
          boleto_line: linha,
          boleto_beneficiary: row.beneficiary_name,
          payment_method: 'Boleto (ASAAS)',
        })
        .eq('id', data.financialEntryId)
    }

    return {
      ok: true as const,
      id: row.id,
      asaasBillId: (bill?.id ?? null) as string | null,
      status,
      scheduledDate: bill?.scheduleDate ?? schedule,
    }

  })

/* ------------------------------------------------------------------
 * 3) Consulta / sincronização / cancelamento
 * ------------------------------------------------------------------ */

export const listarPagamentosBoleto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ financialEntryId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    let q = supabaseAdmin
      .from('asaas_bill_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (data.financialEntryId) q = q.eq('financial_entry_id', data.financialEntryId)
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    return rows ?? []
  })

export const sincronizarPagamentoBoleto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { getAsaasBill } = await import('@/lib/asaas.server')
    const { aplicarStatusBoleto } = await import('@/lib/boleto-pay.server')

    const { data: row, error } = await supabaseAdmin
      .from('asaas_bill_payments')
      .select('*')
      .eq('id', data.id)
      .maybeSingle()
    if (error || !row) throw new Error('Pagamento não encontrado.')
    if (!row.asaas_bill_id) return row

    const bill = await getAsaasBill(row.asaas_bill_id)
    return aplicarStatusBoleto(row.id, bill)
  })

export const cancelarPagamentoBoleto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { cancelAsaasBill } = await import('@/lib/asaas.server')

    const { data: row } = await supabaseAdmin
      .from('asaas_bill_payments')
      .select('*')
      .eq('id', data.id)
      .maybeSingle()
    if (!row) throw new Error('Pagamento não encontrado.')
    if (row.status === 'pago') throw new Error('Pagamento já concluído — não é possível cancelar.')

    if (row.asaas_bill_id) await cancelAsaasBill(row.asaas_bill_id)

    await supabaseAdmin
      .from('asaas_bill_payments')
      .update({ status: 'cancelado', dispatch_pending: false })
      .eq('id', row.id)
    await supabaseAdmin.from('asaas_bill_payment_events').insert({
      bill_payment_id: row.id,
      asaas_bill_id: row.asaas_bill_id,
      event: 'cancelado',
      status: 'cancelado',
      actor_user_id: context.userId,
      ip: ip(),
    })
    if (row.financial_entry_id) {
      await supabaseAdmin
        .from('financial_entries')
        .update({ bill_payment_status: 'cancelado' })
        .eq('id', row.financial_entry_id)
    }
    return { ok: true }
  })

/**
 * Fallback dos webhooks: consulta no ASAAS todos os boletos ainda não
 * finalizados e atualiza o status real (agendado → processando → pago).
 * Também reconcilia envios sem resposta, pela referência externa —
 * nunca cria nem reenvia pagamento.
 */
export const sincronizarTodosPagamentosBoleto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { getAsaasBillSafe, findAsaasBillsByExternalReference } = await import('@/lib/asaas.server')
    const { aplicarStatusBoleto } = await import('@/lib/boleto-pay.server')

    const { data: rows, error } = await supabaseAdmin
      .from('asaas_bill_payments')
      .select('id, status, asaas_bill_id, external_reference, scheduled_date, dispatch_pending')
      .in('status', ['pendente', 'agendado', 'processando'])
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)

    const pendentes = rows ?? []
    let atualizados = 0
    let reconciliados = 0
    let erros = 0
    const mudancas: Array<{ id: string; de: string | null; para: string }> = []

    for (const row of pendentes) {
      try {
        let billId = row.asaas_bill_id as string | null

        // Envio sem confirmação: descobrir se o pagamento existe no banco.
        if (!billId && row.external_reference) {
          if (row.dispatch_pending) continue // agendamento local ainda não enviado
          const rec = await findAsaasBillsByExternalReference(row.external_reference)
          const achado = rec.ok ? rec.bills[0] : null
          if (!achado) continue
          billId = achado.id
          await supabaseAdmin
            .from('asaas_bill_payments')
            .update({
              asaas_bill_id: billId,
              needs_reconciliation: false,
              reconciled_at: new Date().toISOString(),
            } as any)
            .eq('id', row.id)
          reconciliados++
        }
        if (!billId) continue

        const res = await getAsaasBillSafe(billId)
        if (!res.ok) {
          erros++
          continue
        }
        const bill: any = res.data
        const status = mapBillStatus(bill?.status)
        if (status === row.status) continue

        await aplicarStatusBoleto(row.id, bill)
        await supabaseAdmin.from('asaas_bill_payment_events').insert({
          bill_payment_id: row.id,
          asaas_bill_id: billId,
          event: 'MANUAL_SYNC',
          status,
          message: `Sincronização manual: ${row.status ?? '—'} → ${status} (ASAAS: ${bill?.status ?? '—'})`,
          actor_user_id: context.userId,
          ip: ip(),
          payload: bill as any,
        })
        atualizados++
        mudancas.push({ id: row.id, de: row.status, para: status })
      } catch (e) {
        erros++
        console.error('[sync-bills]', row.id, (e as Error).message)
      }
    }

    return { verificados: pendentes.length, atualizados, reconciliados, erros, mudancas }
  })
