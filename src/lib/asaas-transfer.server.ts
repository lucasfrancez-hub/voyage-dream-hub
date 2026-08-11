/**
 * Regras de status das transferências Pix (saques ASAAS).
 * Server-only: usado pelo webhook público e pela sincronização manual.
 *
 * REGRA CRÍTICA: a baixa no financeiro só acontece em `concluido`
 * (TRANSFER_DONE). TRANSFER_CREATED / TRANSFER_PENDING nunca dão baixa.
 * Nenhum evento recria ou redispara transferência — retentativa é sempre
 * ação explícita do usuário.
 */

import {
  deveAtualizarStatus,
  extrairCamposTransfer,
  statusFromTransferEvent,
  type CamposTransfer,
  type TransferStatus,
} from '@/lib/asaas-transfer-events'

export type { TransferStatus }

export function statusFromEvent(event: string): TransferStatus | null {
  return statusFromTransferEvent(event)
}

export async function applyTransferStatus(opts: {
  transferId: string
  status: TransferStatus
  raw?: any
  event: string
  ip?: string | null
  campos?: CamposTransfer | null
}) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { transferId, status, raw, event } = opts
  const campos = opts.campos ?? (raw ? extrairCamposTransfer({ transfer: raw }) : null)

  const { data: row } = await supabaseAdmin
    .from('asaas_transfers')
    .select('*')
    .eq('id', transferId)
    .maybeSingle()
  if (!row) return { ok: false as const, reason: 'not_found' }

  // Webhooks do ASAAS chegam fora de ordem: nunca regredir um estado final.
  const manterStatus = !deveAtualizarStatus(row.status, status)
  const statusFinal = manterStatus ? (row.status as TransferStatus) : status

  await supabaseAdmin
    .from('asaas_transfers')
    .update({
      status: statusFinal,
      asaas_status: campos?.asaasStatus ?? (row as any).asaas_status,
      effective_date: campos?.effectiveDate ?? row.effective_date,
      confirmed_date: campos?.confirmedDate ?? (row as any).confirmed_date,
      end_to_end_identifier: campos?.endToEndIdentifier ?? (row as any).end_to_end_identifier,
      receipt_url: campos?.receiptUrl ?? row.receipt_url,
      fail_reason: campos?.failReason ?? row.fail_reason,
      refusal_reason: campos?.refusalReason ?? (row as any).refusal_reason,
      last_event: event,
      last_event_at: new Date().toISOString(),
      raw_response: raw ?? row.raw_response,
    } as any)
    .eq('id', transferId)

  // Histórico: sempre insere, nunca sobrescreve eventos anteriores.
  await supabaseAdmin.from('asaas_transfer_events').insert({
    transfer_id: transferId,
    asaas_transfer_id: row.asaas_transfer_id,
    event,
    status: statusFinal,
    message: campos?.failReason ?? campos?.refusalReason ?? null,
    ip: opts.ip ?? null,
    payload: raw ?? null,
  })

  if (manterStatus) return { ok: true as const, status: statusFinal, ignoradoRetroativo: true }


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
          `Pago via Pix ASAAS em ${new Date().toLocaleString('pt-BR')} — transferência ${row.asaas_transfer_id ?? ''} — valor R$ ${Number(row.value).toFixed(2)} — por ${row.created_by_name ?? 'sistema'}`,
        ].join('\n'),
      })
      .eq('id', row.financial_entry_id)
  }

  // Alerta no WhatsApp pessoal (saques / pagamentos Pix)
  if (['concluido', 'falhou', 'cancelado'].includes(status)) {
    try {
      const { sendUazAlert } = await import('@/lib/broadcast/sync.server')
      const titulo =
        status === 'concluido'
          ? '\u{1F4B8} *Saque Pix concluído*'
          : status === 'falhou'
            ? '\u274C *Saque Pix falhou*'
            : '\u26A0\uFE0F *Saque Pix cancelado*'
      const linhas = [
        titulo,
        `Valor: R$ ${Number(row.value).toFixed(2)}`,
        row.favored_name ? `Favorecido: ${row.favored_name}` : null,
        row.description ? `Descrição: ${row.description}` : null,
        `Quando: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        row.asaas_transfer_id ? `ASAAS: ${row.asaas_transfer_id}` : null,
        raw?.failReason ? `Motivo: ${raw.failReason}` : null,
      ].filter(Boolean)
      await sendUazAlert(linhas.join('\n'))
    } catch (err) {
      console.error('[asaas-transfer] alerta WhatsApp falhou', err)
    }
  }

  return { ok: true as const, status }
}
