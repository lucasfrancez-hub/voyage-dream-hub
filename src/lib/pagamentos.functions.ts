import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

/**
 * Pagamentos Pix de saída (transferências ASAAS).
 * Todas as operações são administrativas e acontecem 100% no backend —
 * a API Key do ASAAS nunca é exposta ao frontend.
 */

export type TransferStatus =
  | 'agendado'
  | 'pendente'
  | 'processando'
  | 'concluido'
  | 'falhou'
  | 'cancelado'
  | 'bloqueado'

/** Traduz o status do ASAAS para o status interno. */
export function mapAsaasTransferStatus(raw: string | null | undefined): TransferStatus {
  switch (String(raw || '').toUpperCase()) {
    case 'SCHEDULED':
      return 'agendado'
    case 'PENDING':
    case 'AWAITING_CRITICAL_ACTION_AUTHORIZATION':
      return 'pendente'
    case 'BANK_PROCESSING':
    case 'IN_BANK_PROCESSING':
      return 'processando'
    case 'DONE':
      return 'concluido'
    case 'FAILED':
      return 'falhou'
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelado'
    case 'BLOCKED':
      return 'bloqueado'
    default:
      return 'pendente'
  }
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (error) throw new Error(`Falha ao validar permissão: ${error.message}`)
  if (!isAdmin) throw new Error('Acesso restrito a administradores.')
}

function clientIp() {
  try {
    return (
      getRequestHeader('cf-connecting-ip') ||
      (getRequestHeader('x-forwarded-for') || '').split(',')[0]?.trim() ||
      null
    )
  } catch {
    return null
  }
}

/** Lista pagamentos Pix criados no sistema. */
export const listarPagamentosPix = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: rows, error } = await supabaseAdmin
      .from('asaas_transfers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(data.limit ?? 200)
    if (error) throw new Error(error.message)
    return rows ?? []
  })

/** Detalhe + histórico/auditoria de um pagamento. */
export const detalharPagamentoPix = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: transfer } = await supabaseAdmin
      .from('asaas_transfers')
      .select('*')
      .eq('id', data.id)
      .maybeSingle()
    const { data: events } = await supabaseAdmin
      .from('asaas_transfer_events')
      .select('*')
      .eq('transfer_id', data.id)
      .order('created_at', { ascending: false })
      .limit(100)
    return { transfer, events: events ?? [] }
  })

/** Consulta o titular de uma chave Pix (DICT) antes de criar a transferência. */
export const consultarChavePix = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ pixKey: z.string().trim().min(3).max(1500) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { lookupAsaasPixKey } = await import('@/lib/asaas.server')
    return await lookupAsaasPixKey(data.pixKey)
  })

/**
 * Cria uma transferência Pix.
 * Idempotência: a chave é obrigatória e única na tabela — dois cliques em
 * "Confirmar pagamento" retornam o mesmo pagamento, sem duplicar no ASAAS.
 */
export const criarPagamentoPix = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        idempotencyKey: z.string().min(8).max(120),
        favoredName: z.string().trim().max(150).nullable().optional(),
        pixKey: z.string().trim().min(3).max(1500),
        pixKeyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP']).nullable().optional(),
        cpfCnpj: z.string().trim().max(20).nullable().optional(),
        value: z.number().positive().max(1_000_000),
        description: z.string().trim().max(300).nullable().optional(),
        scheduleDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        scheduleTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable()
          .optional(),
        origin: z.enum(['contas_pagar', 'avulso', 'pedido', 'outro']).default('avulso'),
        financialEntryId: z.string().uuid().nullable().optional(),
        orderId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const ip = clientIp()

    // Revalida a chave no DICT: os dados do favorecido vêm sempre da consulta,
    // nunca do que foi digitado no frontend.
    const { lookupAsaasPixKey } = await import('@/lib/asaas.server')
    const owner = await lookupAsaasPixKey(data.pixKey)

    // Controle de duplicidade: mesma chave => devolve o registro existente.
    const { data: existing } = await supabaseAdmin
      .from('asaas_transfers')
      .select('*')
      .eq('idempotency_key', data.idempotencyKey)
      .maybeSingle()
    if (existing) return { transfer: existing, duplicated: true }

    const { data: actor } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', context.userId)
      .maybeSingle()
    const actorName = actor?.full_name ?? null

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    )
    const scheduled = data.scheduleDate && data.scheduleDate >= today ? data.scheduleDate : null

    // Agendamento com HORA: o ASAAS só aceita data, então seguramos aqui e o
    // cron dispara no horário exato (America/Sao_Paulo).
    const { brtToIso } = await import('@/lib/financial-dispatch.server')
    const scheduledAt =
      scheduled && data.scheduleTime ? brtToIso(scheduled, data.scheduleTime) : null
    const segurarLocal = !!scheduledAt && new Date(scheduledAt).getTime() > Date.now()

    const { data: row, error: insErr } = await supabaseAdmin
      .from('asaas_transfers')
      .insert({
        status: scheduled || segurarLocal ? 'agendado' : 'pendente',
        idempotency_key: data.idempotencyKey,
        favored_name: owner.name,
        pix_key: owner.pixKey,
        pix_key_type: owner.pixKeyType,
        cpf_cnpj: owner.cpfCnpj,
        bank_name: owner.bankName ?? null,
        value: data.value,
        description: data.description ?? null,
        scheduled_date: segurarLocal ? scheduled : data.scheduleDate && data.scheduleDate > today ? data.scheduleDate : null,
        scheduled_at: segurarLocal ? scheduledAt : null,
        dispatch_pending: segurarLocal,
        origin: data.origin,
        financial_entry_id: data.financialEntryId ?? null,
        order_id: data.orderId ?? null,
        created_by: context.userId,
        created_by_name: actorName,
        created_ip: ip,
      })
      .select('*')
      .single()
    if (insErr) throw new Error(`Falha ao registrar pagamento: ${insErr.message}`)

    await supabaseAdmin.from('asaas_transfer_events').insert({
      transfer_id: row.id,
      event: 'CREATED_LOCAL',
      status: row.status,
      actor_user_id: context.userId,
      actor_name: actorName,
      ip,
      payload: { value: data.value, pixKey: data.pixKey, origin: data.origin, scheduledAt },
    })

    // Agendado com hora: não envia agora — o cron envia no horário.
    if (segurarLocal) return { transfer: row, duplicated: false, agendadoLocal: true }

    try {
      const { createAsaasPixTransfer } = await import('@/lib/asaas.server')
      const res = await createAsaasPixTransfer({
        value: data.value,
        pixKey: owner.pixKey,
        pixKeyType: owner.pixKeyType,
        description: data.description ?? null,
        scheduleDate: scheduled,
        externalReference: row.id,
      })
      const status = mapAsaasTransferStatus(res?.status)
      const { data: updated } = await supabaseAdmin
        .from('asaas_transfers')
        .update({
          asaas_transfer_id: res?.id ?? null,
          status,
          effective_date: res?.effectiveDate ?? null,
          receipt_url: res?.transactionReceiptUrl ?? null,
          raw_response: res ?? null,
        })
        .eq('id', row.id)
        .select('*')
        .single()

      await supabaseAdmin.from('asaas_transfer_events').insert({
        transfer_id: row.id,
        asaas_transfer_id: res?.id ?? null,
        event: 'ASAAS_TRANSFER_REQUESTED',
        status,
        actor_user_id: context.userId,
        actor_name: actorName,
        ip,
        payload: res ?? null,
      })

      return { transfer: updated ?? row, duplicated: false }
    } catch (err) {
      const message = (err as Error).message
      await supabaseAdmin
        .from('asaas_transfers')
        .update({ status: 'falhou', fail_reason: message })
        .eq('id', row.id)
      await supabaseAdmin.from('asaas_transfer_events').insert({
        transfer_id: row.id,
        event: 'ASAAS_TRANSFER_ERROR',
        status: 'falhou',
        message,
        actor_user_id: context.userId,
        actor_name: actorName,
        ip,
      })
      throw new Error(message)
    }
  })

/** Consulta o ASAAS e sincroniza o status local. */
export const sincronizarPagamentoPix = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: row } = await supabaseAdmin
      .from('asaas_transfers')
      .select('*')
      .eq('id', data.id)
      .maybeSingle()
    if (!row?.asaas_transfer_id) throw new Error('Pagamento sem ID no ASAAS.')

    const { getAsaasTransfer } = await import('@/lib/asaas.server')
    const res = await getAsaasTransfer(row.asaas_transfer_id)
    const status = mapAsaasTransferStatus(res?.status)

    const { applyTransferStatus } = await import('@/lib/asaas-transfer.server')
    const r = await applyTransferStatus({
      transferId: row.id,
      status,
      raw: res,
      event: 'MANUAL_SYNC',
      ip: clientIp(),
      actorUserId: context.userId,
      message: `Sincronização manual: ${row.status ?? '—'} → ${status} (ASAAS: ${res?.status ?? '—'})`,
    })
    return { status, statusAnterior: row.status, mudou: (r as any)?.mudou ?? false }
  })

/**
 * Sincronização real de TODOS os pagamentos ainda não finalizados.
 * Somente GET /v3/transfers/{id} — nunca cria nem reenvia Pix.
 */
export const sincronizarTodosPagamentosPix = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: rows, error } = await supabaseAdmin
      .from('asaas_transfers')
      .select('id, status, asaas_transfer_id')
      .not('asaas_transfer_id', 'is', null)
      .not('status', 'in', '(concluido,cancelado,falhou)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)

    const pendentes = rows ?? []
    if (!pendentes.length) return { verificados: 0, atualizados: 0, erros: 0, mudancas: [] as any[] }

    const { getAsaasTransfer } = await import('@/lib/asaas.server')
    const { applyTransferStatus } = await import('@/lib/asaas-transfer.server')
    const ip = clientIp()

    let atualizados = 0
    let erros = 0
    const mudancas: Array<{ id: string; de: string | null; para: string }> = []

    // Sequencial de propósito: evita rajada contra a API do ASAAS.
    for (const row of pendentes) {
      try {
        const res = await getAsaasTransfer(row.asaas_transfer_id as string)
        const status = mapAsaasTransferStatus(res?.status)
        if (status === row.status) continue
        const r = await applyTransferStatus({
          transferId: row.id,
          status,
          raw: res,
          event: 'MANUAL_SYNC',
          ip,
          actorUserId: context.userId,
          message: `Sincronização manual: ${row.status ?? '—'} → ${status} (ASAAS: ${res?.status ?? '—'})`,
        })
        if ((r as any)?.mudou) {
          atualizados++
          mudancas.push({ id: row.id, de: row.status, para: status })
        }
      } catch (e) {
        erros++
        console.error('[sync-transfers]', row.id, (e as Error).message)
      }
    }

    return { verificados: pendentes.length, atualizados, erros, mudancas }
  })


/** Cancela um pagamento ainda não executado (quando o ASAAS permitir). */
export const cancelarPagamentoPix = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: row } = await supabaseAdmin
      .from('asaas_transfers')
      .select('*')
      .eq('id', data.id)
      .maybeSingle()
    if (!row) throw new Error('Pagamento não encontrado.')
    if (row.status === 'concluido') throw new Error('Pagamento já concluído — não pode ser cancelado.')

    if (row.asaas_transfer_id) {
      const { cancelAsaasTransfer } = await import('@/lib/asaas.server')
      await cancelAsaasTransfer(row.asaas_transfer_id)
    }
    await supabaseAdmin
      .from('asaas_transfers')
      .update({ status: 'cancelado', dispatch_pending: false })
      .eq('id', row.id)
    await supabaseAdmin.from('asaas_transfer_events').insert({
      transfer_id: row.id,
      asaas_transfer_id: row.asaas_transfer_id,
      event: 'CANCELLED_BY_USER',
      status: 'cancelado',
      actor_user_id: context.userId,
      ip: clientIp(),
    })
    return { ok: true }
  })

/** Chave Pix salva por fornecedor (preenchimento automático em Contas a pagar). */
export const buscarChavePixFornecedor = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ supplierName: z.string().trim().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: row } = await supabaseAdmin
      .from('supplier_pix_keys')
      .select('*')
      .ilike('supplier_name', data.supplierName)
      .maybeSingle()
    return row ?? null
  })

export const salvarChavePixFornecedor = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        supplierName: z.string().trim().min(1).max(200),
        favoredName: z.string().trim().max(150).nullable().optional(),
        pixKey: z.string().trim().min(3).max(1500),
        pixKeyType: z.string().trim().max(20).nullable().optional(),
        cpfCnpj: z.string().trim().max(20).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { error } = await supabaseAdmin.from('supplier_pix_keys').upsert(
      {
        supplier_name: data.supplierName,
        favored_name: data.favoredName ?? null,
        pix_key: data.pixKey,
        pix_key_type: data.pixKeyType ?? null,
        cpf_cnpj: data.cpfCnpj ?? null,
      },
      { onConflict: 'supplier_name' },
    )
    if (error) throw new Error(error.message)
    return { ok: true }
  })

/* ============================================================
 * PIX EM PEDIDOS (admin)
 * ============================================================ */

/** Gera (ou reaproveita) o QR Code Pix de um pedido criado manualmente. */
export const gerarPixPedidoAdmin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        valor: z.number().positive(),
        aplicarDesconto: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, full_name, cpf, email')
      .eq('id', data.orderId)
      .maybeSingle()
    if (!order) throw new Error('Pedido não encontrado.')

    const valor = Number(
      (data.aplicarDesconto ? data.valor * 0.95 : data.valor).toFixed(2),
    )

    const nowIso = new Date().toISOString()
    const { data: existing } = await supabaseAdmin
      .from('pix_cobrancas')
      .select('txid, qr_code, qr_code_image, expira_em, valor')
      .eq('order_id', order.id)
      .eq('status', 'ativa')
      .gt('expira_em', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      return {
        txid: existing.txid,
        qrCode: existing.qr_code,
        qrCodeImage: existing.qr_code_image,
        expiraEm: existing.expira_em,
        valor: Number(existing.valor),
        reused: true,
      }
    }

    const { makeTxid } = await import('@/lib/pix.server')
    const { ensureAsaasCustomer, createAsaasPixPayment } = await import('@/lib/asaas.server')
    const txid = makeTxid(order.order_number || order.id.replace(/-/g, '').slice(0, 20))

    const customerId = await ensureAsaasCustomer({
      name: order.full_name || 'Cliente VIA AIR',
      cpfCnpj: order.cpf,
      email: order.email,
      externalReference: order.id,
    })
    const pix = await createAsaasPixPayment({
      customerId,
      value: valor,
      description: `Pedido VIA AIR #${order.order_number ?? ''}`.trim(),
      externalReference: txid,
      expiresInMinutes: 30,
    })

    const image = pix.encodedImage ? `data:image/png;base64,${pix.encodedImage}` : null
    const { error } = await supabaseAdmin.from('pix_cobrancas').insert({
      txid,
      order_id: order.id,
      valor,
      qr_code: pix.payload,
      qr_code_image: image,
      status: 'ativa',
      expira_em: pix.expiresAt,
      payer_name: order.full_name,
      payer_document: order.cpf,
      provider: 'asaas',
      asaas_payment_id: pix.paymentId,
      asaas_customer_id: customerId,
      invoice_url: pix.invoiceUrl,
      raw_response: pix.raw ?? null,
    })
    if (error) throw new Error(`Falha ao salvar cobrança: ${error.message}`)

    return {
      txid,
      qrCode: pix.payload,
      qrCodeImage: image,
      expiraEm: pix.expiresAt,
      valor,
      reused: false,
    }
  })

/** Baixa manual de Pix: o cliente já pagou por fora; não gera cobrança no ASAAS. */
export const baixaPixManualPedido = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        valor: z.number().positive(),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        observacao: z.string().trim().max(1000).nullable().optional(),
        comprovanteUrl: z.string().trim().max(600).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: actor } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', context.userId)
      .maybeSingle()

    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'paid',
        pix_baixa_tipo: 'manual',
        pix_manual_valor: data.valor,
        pix_manual_data: data.data,
        pix_manual_obs: data.observacao ?? null,
        pix_manual_comprovante_url: data.comprovanteUrl ?? null,
        pix_manual_by: context.userId,
        pix_manual_by_name: actor?.full_name ?? null,
        pix_manual_at: new Date().toISOString(),
      })
      .eq('id', data.orderId)
    if (error) throw new Error(error.message)
    return { ok: true, by: actor?.full_name ?? null }
  })

/* ============================================================
 * BOLETO EM PEDIDOS (admin)
 * ============================================================ */

/** Gera (ou reaproveita) um boleto ASAAS para um pedido, com os dados do pagador. */
export const gerarBoletoPedidoAdmin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        valor: z.number().positive(),
        vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        nome: z.string().trim().min(2).nullable().optional(),
        cpfCnpj: z.string().trim().nullable().optional(),
        email: z.string().trim().nullable().optional(),
        telefone: z.string().trim().nullable().optional(),
        descricao: z.string().trim().max(500).nullable().optional(),
        multaPercent: z.number().min(0).max(100).nullable().optional(),
        jurosPercent: z.number().min(0).max(100).nullable().optional(),
        endereco: z
          .object({
            cep: z.string().trim().nullable().optional(),
            logradouro: z.string().trim().nullable().optional(),
            numero: z.string().trim().nullable().optional(),
            complemento: z.string().trim().nullable().optional(),
            bairro: z.string().trim().nullable().optional(),
            cidade: z.string().trim().nullable().optional(),
            estado: z.string().trim().nullable().optional(),
          })
          .nullable()
          .optional(),
        composicao: z
          .object({
            servico: z.string().trim().max(200).nullable().optional(),
            destino: z.string().trim().max(200).nullable().optional(),
            periodoInicio: z.string().trim().nullable().optional(),
            periodoFim: z.string().trim().nullable().optional(),
            passageiros: z.string().trim().max(1000).nullable().optional(),
          })
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, full_name, cpf, email, phone')
      .eq('id', data.orderId)
      .maybeSingle()
    if (!order) throw new Error('Pedido não encontrado.')

    const nome = (data.nome || order.full_name || '').trim()
    const cpfCnpj = (data.cpfCnpj || order.cpf || '').replace(/\D/g, '')
    if (!nome) throw new Error('Informe o nome do pagador.')
    if (cpfCnpj.length < 11) throw new Error('Informe o CPF/CNPJ do pagador.')

    // Reaproveita boleto pendente já emitido para este pedido com o mesmo valor.
    const { data: existing } = await supabaseAdmin
      .from('asaas_recebimentos')
      .select('*')
      .eq('order_id', order.id)
      .eq('kind', 'boleto')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing && Number(existing.value) === Number(data.valor.toFixed(2))) {
      return {
        reused: true,
        id: existing.id,
        valor: Number(existing.value),
        vencimento: existing.due_date as string,
        bankSlipUrl: existing.bank_slip_url,
        invoiceUrl: existing.invoice_url,
        linhaDigitavel: existing.identification_field,
        nossoNumero: ((existing.raw_response as any)?.payment?.nossoNumero ?? null) as string | null,
        agenciaCodigo: ((existing.raw_response as any)?.conta?.agenciaCodigo ?? null) as string | null,
        pixPayload: existing.pix_payload,
        pixQrImage: existing.pix_qr_image,
        pagador: {
          nome: existing.customer_name,
          cpfCnpj: existing.customer_cpf_cnpj,
          email: existing.customer_email,
          telefone: existing.customer_phone,
          endereco: ((existing.composicao as any)?.endereco ?? null) as string | null,
        },
        composicao: {
          servico: ((existing.composicao as any)?.servico ?? null) as string | null,
          destino: ((existing.composicao as any)?.destino ?? null) as string | null,
          periodo: ((existing.composicao as any)?.periodo ?? null) as string | null,
          passageiro: ((existing.composicao as any)?.passageiro ?? null) as string | null,
        },
        multaPercent: (existing.fine_percent ?? null) as number | null,
        jurosPercentMes: (existing.interest_percent ?? null) as number | null,
      }
    }

    const { ensureAsaasCustomer, createAsaasCharge } = await import('@/lib/asaas.server')
    const end = data.endereco ?? null
    const customerId = await ensureAsaasCustomer({
      name: nome,
      cpfCnpj,
      email: data.email || order.email || undefined,
      phone: data.telefone || (order as any).phone || undefined,
      externalReference: order.id,
      postalCode: end?.cep || undefined,
      address: end?.logradouro || undefined,
      addressNumber: end?.numero || undefined,
      complement: end?.complemento || undefined,
      province: end?.bairro || undefined,
      city: end?.cidade || undefined,
      state: end?.estado || undefined,
    } as any)

    const descricao =
      data.descricao || `Pedido VIA AIR #${order.order_number ?? ''}`.trim()

    const charge = await createAsaasCharge({
      customerId,
      billingType: 'BOLETO',
      value: data.valor,
      dueDate: data.vencimento,
      description: descricao,
      externalReference: order.id,
      finePercent: data.multaPercent ?? null,
      interestPercent: data.jurosPercent ?? null,
    })

    const { data: actor } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', context.userId)
      .maybeSingle()

    const pixQrImage = charge.pixEncodedImage
      ? `data:image/png;base64,${charge.pixEncodedImage}`
      : null

    const enderecoTexto =
      [
        [end?.logradouro, end?.numero].filter(Boolean).join(', '),
        end?.complemento,
        end?.bairro,
        [end?.cidade, end?.estado].filter(Boolean).join('/'),
        end?.cep ? `CEP ${end.cep}` : '',
      ]
        .filter((p) => p && String(p).trim())
        .join(' - ') || null

    const fmtData = (d?: string | null) =>
      d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : ''
    const periodoTexto =
      [fmtData(data.composicao?.periodoInicio), fmtData(data.composicao?.periodoFim)]
        .filter(Boolean)
        .join(' a ') || null

    const { data: row, error } = await supabaseAdmin
      .from('asaas_recebimentos')
      .insert({
        kind: 'boleto',
        status: 'pendente',
        customer_name: nome,
        customer_cpf_cnpj: cpfCnpj,
        customer_email: data.email || order.email || null,
        customer_phone: data.telefone || (order as any).phone || null,
        value: data.valor,
        due_date: data.vencimento,
        description: descricao,
        order_id: order.id,
        fine_percent: data.multaPercent ?? null,
        interest_percent: data.jurosPercent ?? null,
        composicao: {
          servico: data.composicao?.servico ?? null,
          destino: data.composicao?.destino ?? null,
          periodo: periodoTexto,
          passageiro: data.composicao?.passageiros ?? null,
          endereco: enderecoTexto,
        } as any,
        asaas_payment_id: charge.paymentId,
        asaas_customer_id: customerId,
        invoice_url: charge.invoiceUrl,
        bank_slip_url: charge.bankSlipUrl,
        identification_field: charge.identificationField,
        pix_payload: charge.pixPayload,
        pix_qr_image: pixQrImage,
        created_by: context.userId,
        created_by_name: actor?.full_name ?? null,
        raw_response: charge.raw as any,
      })
      .select('id')
      .single()
    if (error) throw new Error(`Falha ao salvar boleto: ${error.message}`)

    return {
      reused: false,
      id: row.id as string,
      valor: Number(data.valor.toFixed(2)),
      vencimento: data.vencimento,
      bankSlipUrl: charge.bankSlipUrl,
      invoiceUrl: charge.invoiceUrl,
      linhaDigitavel: charge.identificationField,
      nossoNumero: (charge.nossoNumero ?? (charge.raw as any)?.payment?.nossoNumero ?? null) as string | null,
      agenciaCodigo: (charge.agenciaCodigo ?? null) as string | null,
      pixPayload: charge.pixPayload,
      pixQrImage,
      pagador: {
        nome,
        cpfCnpj,
        email: data.email || order.email || null,
        telefone: data.telefone || (order as any).phone || null,
        endereco: enderecoTexto,
      },
      composicao: {
        servico: data.composicao?.servico ?? null,
        destino: data.composicao?.destino ?? null,
        periodo: periodoTexto,
        passageiro: data.composicao?.passageiros ?? null,
      },
      multaPercent: data.multaPercent ?? null,
      jurosPercentMes: data.jurosPercent ?? null,
    }
  })
