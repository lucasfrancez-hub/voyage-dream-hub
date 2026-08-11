/**
 * Disparo dos pagamentos financeiros AGENDADOS COM HORA.
 *
 * O ASAAS só aceita agendamento por DATA (sem hora). Quando o usuário escolhe
 * uma hora específica no financeiro, o pagamento fica "segurado" aqui
 * (`dispatch_pending = true` + `scheduled_at`) e só é enviado ao ASAAS quando
 * chega o horário — via cron em /api/public/hooks/financial-schedule-dispatch.
 *
 * SERVER-ONLY.
 */

/** Converte data (yyyy-mm-dd) + hora (HH:mm) no fuso de São Paulo para ISO UTC. */
export function brtToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const hhmm = /^\d{2}:\d{2}$/.test(time) ? time : '09:00'
  // BRT é UTC-3 o ano todo (sem horário de verão desde 2019).
  const iso = new Date(`${date}T${hhmm}:00-03:00`)
  if (Number.isNaN(iso.getTime())) return null
  return iso.toISOString()
}

/** Hora local (BRT) formatada HH:mm a partir de um ISO. */
export function isoToBrtTime(iso?: string | null): string | null {
  if (!iso) return null
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Envia ao ASAAS uma transferência Pix que estava agendada localmente. */
async function dispararTransferencia(row: any) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { createAsaasPixTransfer } = await import('@/lib/asaas.server')
  const { mapAsaasTransferStatus } = await import('@/lib/pagamentos.helpers')

  try {
    const res: any = await createAsaasPixTransfer({
      value: Number(row.value),
      pixKey: row.pix_key,
      pixKeyType: row.pix_key_type,
      description: row.description ?? null,
      scheduleDate: null,
      externalReference: row.id,
    })
    const status = mapAsaasTransferStatus(res?.status)
    await supabaseAdmin
      .from('asaas_transfers')
      .update({
        asaas_transfer_id: res?.id ?? null,
        status,
        dispatch_pending: false,
        effective_date: res?.effectiveDate ?? null,
        receipt_url: res?.transactionReceiptUrl ?? null,
        raw_response: res ?? null,
      })
      .eq('id', row.id)

    await supabaseAdmin.from('asaas_transfer_events').insert({
      transfer_id: row.id,
      asaas_transfer_id: res?.id ?? null,
      event: 'ASAAS_TRANSFER_REQUESTED',
      status,
      message: 'Disparo automático do agendamento com hora',
      payload: res ?? null,
    })
    return { id: row.id, ok: true as const, status }
  } catch (err) {
    const message = (err as Error).message
    await supabaseAdmin
      .from('asaas_transfers')
      .update({ status: 'falhou', dispatch_pending: false, fail_reason: message })
      .eq('id', row.id)
    await supabaseAdmin.from('asaas_transfer_events').insert({
      transfer_id: row.id,
      event: 'ASAAS_TRANSFER_ERROR',
      status: 'falhou',
      message,
    })
    return { id: row.id, ok: false as const, message }
  }
}

/** Envia ao ASAAS um pagamento de boleto que estava agendado localmente. */
async function dispararBoleto(row: any) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { createAsaasBill } = await import('@/lib/asaas.server')
  const { mapBillStatus } = await import('@/lib/boleto-pay.helpers')

  try {
    const bill: any = await createAsaasBill({
      identificationField: row.identification_field,
      scheduleDate: null,
      description: row.description ?? null,
      externalReference: row.external_reference ?? row.id,
    })
    const status = mapBillStatus(bill?.status)
    await supabaseAdmin
      .from('asaas_bill_payments')
      .update({
        asaas_bill_id: bill?.id ?? null,
        status,
        dispatch_pending: false,
        effective_date: bill?.paymentDate ?? null,
        raw_response: bill ?? null,
      })
      .eq('id', row.id)

    await supabaseAdmin.from('asaas_bill_payment_events').insert({
      bill_payment_id: row.id,
      asaas_bill_id: bill?.id ?? null,
      event: 'enviado',
      status,
      payload: bill ?? null,
    })

    if (row.financial_entry_id) {
      await supabaseAdmin
        .from('financial_entries')
        .update({ bill_payment_status: status })
        .eq('id', row.financial_entry_id)
    }
    return { id: row.id, ok: true as const, status }
  } catch (err) {
    const message = (err as Error).message
    await supabaseAdmin
      .from('asaas_bill_payments')
      .update({ status: 'falhou', dispatch_pending: false, fail_reason: message })
      .eq('id', row.id)
    await supabaseAdmin.from('asaas_bill_payment_events').insert({
      bill_payment_id: row.id,
      event: 'erro',
      status: 'falhou',
      message,
    })
    return { id: row.id, ok: false as const, message }
  }
}

/** Processa todos os agendamentos com hora que já venceram. */
export async function processarAgendamentosFinanceiros() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const agora = new Date().toISOString()

  const { data: transfers } = await supabaseAdmin
    .from('asaas_transfers')
    .select('*')
    .eq('dispatch_pending', true)
    .lte('scheduled_at', agora)
    .limit(25)

  const { data: bills } = await supabaseAdmin
    .from('asaas_bill_payments')
    .select('*')
    .eq('dispatch_pending', true)
    .lte('scheduled_at', agora)
    .limit(25)

  const resultados: any[] = []
  for (const row of transfers ?? []) {
    // trava otimista: só dispara quem ainda está pendente
    const { data: lock } = await supabaseAdmin
      .from('asaas_transfers')
      .update({ dispatch_pending: false })
      .eq('id', row.id)
      .eq('dispatch_pending', true)
      .select('id')
      .maybeSingle()
    if (!lock) continue
    resultados.push({ tipo: 'pix', ...(await dispararTransferencia(row)) })
  }
  for (const row of bills ?? []) {
    const { data: lock } = await supabaseAdmin
      .from('asaas_bill_payments')
      .update({ dispatch_pending: false })
      .eq('id', row.id)
      .eq('dispatch_pending', true)
      .select('id')
      .maybeSingle()
    if (!lock) continue
    resultados.push({ tipo: 'boleto', ...(await dispararBoleto(row)) })
  }

  return { processados: resultados.length, resultados }
}
