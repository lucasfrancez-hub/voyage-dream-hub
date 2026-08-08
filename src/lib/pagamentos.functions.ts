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
        favoredName: z.string().trim().min(2).max(150),
        pixKey: z.string().trim().min(3).max(200),
        pixKeyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP']).nullable().optional(),
        cpfCnpj: z.string().trim().max(20).nullable().optional(),
        value: z.number().positive().max(1_000_000),
        description: z.string().trim().max(300).nullable().optional(),
        scheduleDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
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
    const scheduled = data.scheduleDate && data.scheduleDate > today ? data.scheduleDate : null

    const { data: row, error: insErr } = await supabaseAdmin
      .from('asaas_transfers')
      .insert({
        status: scheduled ? 'agendado' : 'pendente',
        idempotency_key: data.idempotencyKey,
        favored_name: data.favoredName,
        pix_key: data.pixKey,
        pix_key_type: data.pixKeyType ?? null,
        cpf_cnpj: data.cpfCnpj ?? null,
        value: data.value,
        description: data.description ?? null,
        scheduled_date: scheduled,
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
      payload: { value: data.value, pixKey: data.pixKey, origin: data.origin },
    })

    try {
      const { createAsaasPixTransfer } = await import('@/lib/asaas.server')
      const res = await createAsaasPixTransfer({
        value: data.value,
        pixKey: data.pixKey,
        pixKeyType: data.pixKeyType ?? null,
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
    await applyTransferStatus({ transferId: row.id, status, raw: res, event: 'MANUAL_SYNC' })
    return { status }
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
    await supabaseAdmin.from('asaas_transfers').update({ status: 'cancelado' }).eq('id', row.id)
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
        pixKey: z.string().trim().min(3).max(200),
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
