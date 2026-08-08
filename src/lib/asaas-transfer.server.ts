/**
 * Regras de status das transferências Pix (saques ASAAS).
 * Server-only: usado pelo webhook público e pela sincronização manual.
 *
 * REGRA CRÍTICA: a baixa no financeiro só acontece em `concluido`
 * (TRANSFER_DONE). TRANSFER_CREATED / TRANSFER_PENDING nunca dão baixa.
 */

export type TransferStatus =
  | 'agendado'
  | 'pendente'
  | 'processando'
  | 'concluido'
  | 'falhou'
  | 'cancelado'
  | 'bloqueado'

export function statusFromEvent(event: string): TransferStatus | null {
  switch (String(event || '').toUpperCase()) {
    case 'TRANSFER_CREATED':
      return 'pendente'
    case 'TRANSFER_PENDING':
      return 'pendente'
    case 'TRANSFER_IN_BANK_PROCESSING':
      return 'processando'
    case 'TRANSFER_DONE':
      return 'concluido'
    case 'TRANSFER_FAILED':
      return 'falhou'
    case 'TRANSFER_CANCELLED':
    case 'TRANSFER_CANCELED':
      return 'cancelado'
    case 'TRANSFER_BLOCKED':
      return 'bloqueado'
    default:
      return null
  }
}

export async function applyTransferStatus(opts: {
  transferId: string
  status: TransferStatus
  raw?: any
  event: string
  ip?: string | null
}) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { transferId, status, raw, event } = opts

  const { data: row } = await supabaseAdmin
    .from('asaas_transfers')
    .select('*')
    .eq('id', transferId)
    .maybeSingle()
  if (!row) return { ok: false as const, reason: 'not_found' }

  await supabaseAdmin
    .from('asaas_transfers')
    .update({
      status,
      effective_date: raw?.effectiveDate ?? row.effective_date,
      receipt_url: raw?.transactionReceiptUrl ?? row.receipt_url,
      fail_reason: raw?.failReason ?? row.fail_reason,
      raw_response: raw ?? row.raw_response,
    })
    .eq('id', transferId)

  await supabaseAdmin.from('asaas_transfer_events').insert({
    transfer_id: transferId,
    asaas_transfer_id: row.asaas_transfer_id,
    event,
    status,
    ip: opts.ip ?? null,
    payload: raw ?? null,
  })

  // Baixa no Contas a pagar apenas quando o Pix foi efetivamente concluído.
  if (status === 'concluido' && row.financial_entry_id) {
    const paidDate =
      (raw?.effectiveDate as string | undefined) ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    await supabaseAdmin
      .from('financial_entries')
      .update({
        status: 'paid',
        paid_date: paidDate.slice(0, 10),
        payment_method: 'pix_asaas',
        notes: [
          row.notes_prefix,
          `Pago via Pix ASAAS em ${new Date().toLocaleString('pt-BR')} — transferência ${row.asaas_transfer_id ?? ''} — valor R$ ${Number(row.value).toFixed(2)} — por ${row.created_by_name ?? 'sistema'}`,
        ]
          .filter(Boolean)
          .join('\n'),
      })
      .eq('id', row.financial_entry_id)
  }

  return { ok: true as const, status }
}
