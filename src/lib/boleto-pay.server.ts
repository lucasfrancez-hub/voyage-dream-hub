import { mapBillStatus } from './boleto-pay.helpers'

/**
 * Aplica no banco o status retornado pelo ASAAS para um pagamento de boleto.
 * Só dá baixa financeira quando o pagamento é efetivamente confirmado (PAID).
 */
export async function aplicarStatusBoleto(billPaymentId: string, bill: any) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  const { data: row } = await supabaseAdmin
    .from('asaas_bill_payments')
    .select('*')
    .eq('id', billPaymentId)
    .maybeSingle()
  if (!row) throw new Error('Pagamento não encontrado.')

  const status = mapBillStatus(bill?.status)
  const paidValue =
    bill?.value != null ? Number(bill.value) : row.paid_value != null ? Number(row.paid_value) : null
  const effective: string | null = bill?.paymentDate ?? bill?.effectiveDate ?? null

  const { data: updated } = await supabaseAdmin
    .from('asaas_bill_payments')
    .update({
      asaas_bill_id: bill?.id ?? row.asaas_bill_id,
      status,
      scheduled_date: bill?.scheduleDate ?? row.scheduled_date,
      effective_date: effective,
      paid_value: status === 'pago' ? paidValue : row.paid_value,
      fail_reason: status === 'falhou' ? (bill?.failReasons ?? bill?.description ?? null) : row.fail_reason,
      raw_response: bill as any,
    })
    .eq('id', row.id)
    .select('*')
    .single()

  await supabaseAdmin.from('asaas_bill_payment_events').insert({
    bill_payment_id: row.id,
    asaas_bill_id: bill?.id ?? row.asaas_bill_id,
    event: 'sync',
    status,
    payload: bill as any,
  })

  if (row.financial_entry_id) {
    const patch: Record<string, any> = { bill_payment_status: status }
    if (status === 'pago') {
      patch['status'] = 'paid'
      patch['paid_date'] = effective ?? new Date().toISOString().slice(0, 10)
      patch['payment_method'] = 'Boleto (ASAAS)'
    }
    await supabaseAdmin.from('financial_entries').update(patch).eq('id', row.financial_entry_id)
  }

  return updated ?? row
}
