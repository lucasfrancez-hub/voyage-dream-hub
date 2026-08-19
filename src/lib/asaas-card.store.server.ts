/**
 * Persistência das cobranças de cartão, histórico de webhooks e antecipações.
 * Server-only. Nunca grava número completo do cartão nem CVV.
 */

import { mapStatusPagamento, type StatusPagamento } from './asaas-card.server'

/** Remove qualquer dado sensível de cartão antes de gravar payload/log. */
export function sanitizarPayload(input: any): any {
  const visto = new WeakSet()
  const limpar = (v: any): any => {
    if (Array.isArray(v)) return v.map(limpar)
    if (v && typeof v === 'object') {
      if (visto.has(v)) return null
      visto.add(v)
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v)) {
        const chave = k.toLowerCase()
        if (['ccv', 'cvv', 'securitycode'].includes(chave)) continue
        if (chave === 'number' || chave === 'cardnumber') {
          const digitos = String(val ?? '').replace(/\D/g, '')
          out[k] = digitos ? `••••${digitos.slice(-4)}` : null
          continue
        }
        if (chave === 'creditcard' && val && typeof val === 'object') {
          const c = val as Record<string, unknown>
          out[k] = {
            creditCardBrand: c['creditCardBrand'] ?? null,
            creditCardNumber: c['creditCardNumber'] ?? null,
            creditCardToken: c['creditCardToken'] ?? null,
          }
          continue
        }
        out[k] = limpar(val)
      }
      return out
    }
    if (typeof v === 'string') return v.replace(/\b\d{13,19}\b/g, '••••')
    return v
  }
  return limpar(input)
}

const soData = (v?: string | null) => (v ? String(v).slice(0, 10) : null)

/** Campos financeiros/identificadores extraídos do objeto payment do ASAAS. */
export function camposDoPagamento(payment: any) {
  const cc = payment?.creditCard ?? {}
  const last4 =
    cc.creditCardNumber ?? (payment?.creditCardNumber ? String(payment.creditCardNumber) : null)
  return {
    asaas_payment_id: payment?.id ? String(payment.id) : null,
    asaas_customer_id: payment?.customer ? String(payment.customer) : null,
    asaas_installment_id: payment?.installment ? String(payment.installment) : null,
    asaas_status: payment?.status ? String(payment.status) : null,
    billing_type: payment?.billingType ?? 'CREDIT_CARD',
    date_created: soData(payment?.dateCreated),
    confirmed_date: soData(payment?.confirmedDate),
    payment_date: soData(payment?.paymentDate),
    credit_date: soData(payment?.creditDate ?? payment?.estimatedCreditDate),
    valor_bruto: payment?.value != null ? Number(payment.value) : null,
    valor_liquido: payment?.netValue != null ? Number(payment.netValue) : null,
    taxas:
      payment?.value != null && payment?.netValue != null
        ? Number((Number(payment.value) - Number(payment.netValue)).toFixed(2))
        : null,
    card_brand: cc.creditCardBrand ?? null,
    card_last4: last4 ? String(last4).replace(/\D/g, '').slice(-4) : null,
    card_token: cc.creditCardToken ?? null,
    // Só preenche quando o ASAAS realmente devolver — nunca inventar.
    authorization_code: payment?.authorizationCode ?? payment?.creditCard?.authorizationCode ?? null,
    nsu: payment?.nsu ?? payment?.transactionReference ?? null,
    tid: payment?.tid ?? payment?.transactionIdentifier ?? null,
    acquirer_transaction_id: payment?.acquirerTransactionId ?? payment?.externalTransactionId ?? null,
  }
}

/** Aplica um payment do ASAAS na cobrança interna. */
export async function aplicarPagamento(
  chargeId: string,
  payment: any,
  extra?: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const campos = camposDoPagamento(payment)
  const status = mapStatusPagamento(payment?.status)
  await supabaseAdmin
    .from('asaas_card_charges')
    .update({ ...campos, status, raw: sanitizarPayload(payment), ...(extra ?? {}) })
    .eq('id', chargeId)
  return status
}

const MAPA_EVENTO_PAGAMENTO: Record<string, StatusPagamento | null> = {
  PAYMENT_CREATED: null,
  PAYMENT_AUTHORIZED: null, // pré-autorização: não é venda concluída
  PAYMENT_AWAITING_RISK_ANALYSIS: 'em_analise',
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: 'aprovado',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'recusado',
  PAYMENT_CONFIRMED: 'aprovado',
  PAYMENT_RECEIVED: 'recebido',
  PAYMENT_ANTICIPATED: null,
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'recusado',
  PAYMENT_REFUNDED: 'estornado',
  PAYMENT_PARTIALLY_REFUNDED: 'estornado_parcial',
  PAYMENT_REFUND_IN_PROGRESS: 'estornado',
  PAYMENT_REFUND_DENIED: null,
  PAYMENT_CHARGEBACK_REQUESTED: 'chargeback',
  PAYMENT_CHARGEBACK_DISPUTE: 'chargeback',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'chargeback',
  PAYMENT_DELETED: null,
  PAYMENT_OVERDUE: null,
}

export function isEventoCartao(event: string) {
  return event in MAPA_EVENTO_PAGAMENTO
}

export function isEventoAntecipacao(event: string) {
  return event.startsWith('RECEIVABLE_ANTICIPATION_')
}

/**
 * Processa um webhook PAYMENT_* de uma cobrança de cartão nossa.
 * Idempotente pelo id do evento: reprocessos não repetem efeitos financeiros.
 */
export async function processarWebhookCartao(body: any) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const event = String(body?.event ?? '')
  const payment = body?.payment ?? {}
  const paymentId = payment?.id ? String(payment.id) : null
  if (!paymentId) return { handled: false, reason: 'sem payment id' }

  const { data: charge } = await supabaseAdmin
    .from('asaas_card_charges')
    .select('id, status, anticipation_status')
    .eq('asaas_payment_id', paymentId)
    .maybeSingle()
  if (!charge) return { handled: false, reason: 'cobrança de cartão não encontrada' }

  const eventoId = body?.id ? String(body.id) : `${event}:${paymentId}:${payment?.status ?? ''}`
  const { data: jaVisto } = await supabaseAdmin
    .from('asaas_charge_events')
    .select('id')
    .eq('asaas_event_id', eventoId)
    .maybeSingle()
  if (jaVisto) return { handled: true, duplicate: true }

  const anterior = charge.status as string
  const novo = MAPA_EVENTO_PAGAMENTO[event] ?? null
  const patch: Record<string, unknown> = {
    ...camposDoPagamento(payment),
    raw: sanitizarPayload(payment),
  }
  if (novo) patch['status'] = novo
  if (event.startsWith('PAYMENT_CHARGEBACK') || event === 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL')
    patch['chargeback_status'] = event
  if (event === 'PAYMENT_ANTICIPATED') patch['anticipation_status'] = 'ANTICIPATED'

  await supabaseAdmin.from('asaas_card_charges').update(patch).eq('id', charge.id)

  await supabaseAdmin.from('asaas_charge_events').insert({
    charge_id: charge.id,
    asaas_event_id: eventoId,
    event_type: event,
    asaas_payment_id: paymentId,
    status_anterior: anterior,
    status_novo: (novo ?? anterior) as string,
    resultado: 'processado',
    payload: sanitizarPayload(body),
  })

  return { handled: true, status: novo ?? anterior }
}

/** Processa webhooks RECEIVABLE_ANTICIPATION_*. */
export async function processarWebhookAntecipacao(body: any) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const event = String(body?.event ?? '')
  const ant = body?.anticipation ?? body?.receivableAnticipation ?? {}
  const antId = ant?.id ? String(ant.id) : null
  if (!antId) return { handled: false, reason: 'sem anticipation id' }

  const eventoId = body?.id ? String(body.id) : `${event}:${antId}:${ant?.status ?? ''}`
  const { data: jaVisto } = await supabaseAdmin
    .from('asaas_charge_events')
    .select('id')
    .eq('asaas_event_id', eventoId)
    .maybeSingle()
  if (jaVisto) return { handled: true, duplicate: true }

  const paymentId = ant?.payment ? String(ant.payment) : null
  const installmentId = ant?.installment ? String(ant.installment) : null

  let chargeId: string | null = null
  if (paymentId) {
    const { data } = await supabaseAdmin
      .from('asaas_card_charges')
      .select('id')
      .eq('asaas_payment_id', paymentId)
      .maybeSingle()
    chargeId = data?.id ?? null
  }
  if (!chargeId && installmentId) {
    const { data } = await supabaseAdmin
      .from('asaas_card_charges')
      .select('id')
      .eq('asaas_installment_id', installmentId)
      .maybeSingle()
    chargeId = data?.id ?? null
  }

  const registro = {
    charge_id: chargeId,
    asaas_anticipation_id: antId,
    asaas_payment_id: paymentId,
    asaas_installment_id: installmentId,
    status: String(ant?.status ?? event.replace('RECEIVABLE_ANTICIPATION_', '')),
    requested_at: ant?.requestDate ? new Date(ant.requestDate).toISOString() : null,
    scheduled_date: ant?.scheduledDate ? String(ant.scheduledDate).slice(0, 10) : null,
    credit_date: ant?.creditDate ? String(ant.creditDate).slice(0, 10) : null,
    valor_bruto: ant?.value != null ? Number(ant.value) : null,
    taxa: ant?.fee != null ? Number(ant.fee) : ant?.totalFee != null ? Number(ant.totalFee) : null,
    valor_liquido: ant?.netValue != null ? Number(ant.netValue) : null,
    parcelas_antecipadas: ant?.installmentCount != null ? Number(ant.installmentCount) : null,
    denial_reason: ant?.denialReason ?? null,
    raw: sanitizarPayload(ant),
  }

  const { data: salvo } = await supabaseAdmin
    .from('asaas_anticipations')
    .upsert(registro, { onConflict: 'asaas_anticipation_id' })
    .select('id')
    .maybeSingle()

  if (chargeId) {
    await supabaseAdmin
      .from('asaas_card_charges')
      .update({ anticipation_status: registro.status })
      .eq('id', chargeId)
  }

  await supabaseAdmin.from('asaas_charge_events').insert({
    charge_id: chargeId,
    anticipation_id: salvo?.id ?? null,
    asaas_event_id: eventoId,
    event_type: event,
    asaas_payment_id: paymentId,
    asaas_anticipation_id: antId,
    status_novo: registro.status,
    resultado: 'processado',
    payload: sanitizarPayload(body),
  })

  return { handled: true, status: registro.status }
}
