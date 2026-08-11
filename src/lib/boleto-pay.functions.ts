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
        confirmado: z.literal(true),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const {
      simulateAsaasBill,
      createAsaasBill,
    } = await import('@/lib/asaas.server')

    const linha = onlyDigits(data.identificationField)

    // 6) sem duplicidade: bloqueia se já existe pagamento ativo p/ o boleto ou lançamento
    const ativos = ['pendente', 'agendado', 'processando', 'pago']
    const { data: existentes } = await supabaseAdmin
      .from('asaas_bill_payments')
      .select('id, status, scheduled_date, asaas_bill_id')
      .in('status', ativos)
      .or(
        [
          `identification_field.eq.${linha}`,
          data.financialEntryId ? `financial_entry_id.eq.${data.financialEntryId}` : '',
        ]
          .filter(Boolean)
          .join(','),
      )
      .limit(1)
    if (existentes && existentes.length > 0) {
      throw new Error(
        'Já existe um pagamento ativo para este boleto/lançamento. Cancele o pagamento atual antes de criar outro.',
      )
    }

    // 3) sempre revalidar no ASAAS antes de pagar
    const sim = await simulateAsaasBill(linha)
    const valorAsaas = Number(sim?.value ?? sim?.totalValue ?? 0) || null
    if (valorAsaas && Math.abs(valorAsaas - data.value) > 0.01) {
      throw new Error(
        `Divergência de valor: informado R$ ${data.value.toFixed(2)} × boleto R$ ${valorAsaas.toFixed(2)}.`,
      )
    }

    const venc = (sim?.dueDate as string | undefined) || data.dueDate || null
    let schedule = data.scheduleDate || null
    // Agendamento com HORA: o ASAAS só aceita data, então seguramos localmente
    // e o cron dispara no horário exato (America/Sao_Paulo).
    const { brtToIso } = await import('@/lib/financial-dispatch.server')
    const scheduledAt =
      schedule && data.scheduleTime ? brtToIso(schedule, data.scheduleTime) : null
    const segurarLocal = !!scheduledAt && new Date(scheduledAt!).getTime() > Date.now()
    if (schedule && schedule <= todayBRT() && !segurarLocal) schedule = null
    if (schedule && isBoletoVencido(venc)) {
      throw new Error('Este boleto está vencido. O pagamento não pode ser agendado para uma data futura.')
    }

    const idem = `bill:${linha}:${scheduledAt ?? schedule ?? 'now'}`
    const externalRef = data.financialEntryId ? `entry:${data.financialEntryId}` : idem

    const { data: row, error: insErr } = await supabaseAdmin
      .from('asaas_bill_payments')
      .insert({
        financial_entry_id: data.financialEntryId ?? null,
        identification_field: linha,
        beneficiary_name: data.beneficiaryName ?? (sim?.companyName as string | undefined) ?? null,
        beneficiary_document: data.beneficiaryDocument ?? null,
        value: data.value,
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
        idempotency_key: `${idem}:${Date.now()}`,
        raw_simulation: sim as any,
        created_by: context.userId,
        created_by_name: (context as any).claims?.email ?? null,
        created_ip: ip(),
      })
      .select('*')
      .single()
    if (insErr) throw new Error(insErr.message)

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
      return { id: row.id, asaasBillId: null, status: 'agendado', scheduledDate: schedule }
    }

    try {
      const bill = await createAsaasBill({
        identificationField: linha,
        scheduleDate: schedule,
        description: data.description ?? null,
        externalReference: externalRef,
      })
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

      return { id: row.id, asaasBillId: bill?.id ?? null, status, scheduledDate: bill?.scheduleDate ?? schedule }
    } catch (e) {
      const msg = (e as Error).message
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
      })
      throw new Error(msg)
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
