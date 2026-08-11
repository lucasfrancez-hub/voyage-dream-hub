/**
 * Ciclo de vida das transferências Pix (eventos TRANSFER_* do ASAAS).
 *
 * Módulo PURO (sem acesso a banco/rede) para poder ser testado isoladamente.
 * Ele apenas interpreta o payload do webhook; quem persiste é
 * `asaas-transfer.server.ts`.
 *
 * IMPORTANTE: nada aqui autoriza, dispara ou recria transferências.
 */

export type TransferStatus =
  | 'agendado'
  | 'pendente'
  | 'processando'
  | 'concluido'
  | 'falhou'
  | 'cancelado'
  | 'bloqueado'

/** Eventos de ciclo de vida que registramos. */
export const TRANSFER_EVENTS = [
  'TRANSFER_CREATED',
  'TRANSFER_PENDING',
  'TRANSFER_IN_BANK_PROCESSING',
  'TRANSFER_BLOCKED',
  'TRANSFER_FAILED',
  'TRANSFER_DONE',
  'TRANSFER_CANCELLED',
] as const

export function isTransferEvent(event: string | null | undefined): boolean {
  return String(event || '').toUpperCase().startsWith('TRANSFER_')
}

/** Status interno derivado do evento recebido. */
export function statusFromTransferEvent(event: string): TransferStatus | null {
  switch (String(event || '').toUpperCase()) {
    case 'TRANSFER_CREATED':
    case 'TRANSFER_PENDING':
    case 'TRANSFER_AWAITING_AUTHORIZATION':
      return 'pendente'
    case 'TRANSFER_IN_BANK_PROCESSING':
    case 'TRANSFER_BANK_PROCESSING':
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

/**
 * Ordem do ciclo de vida. Usada só para NÃO regredir o status quando os
 * webhooks chegam fora de ordem (`sendType: NON_SEQUENTIALLY` no ASAAS).
 * Estados finais têm peso maior e nunca voltam para pendente/processando.
 */
const PESO: Record<TransferStatus, number> = {
  agendado: 0,
  pendente: 1,
  processando: 2,
  bloqueado: 3,
  concluido: 4,
  falhou: 4,
  cancelado: 4,
}

/** `true` quando o novo status deve substituir o atual. */
export function deveAtualizarStatus(atual: string | null | undefined, novo: TransferStatus): boolean {
  const a = PESO[(atual ?? '') as TransferStatus]
  if (a === undefined) return true
  if (novo === atual) return true
  return PESO[novo] >= a
}

export type CamposTransfer = {
  asaasTransferId: string | null
  externalReference: string | null
  asaasStatus: string | null
  failReason: string | null
  refusalReason: string | null
  endToEndIdentifier: string | null
  effectiveDate: string | null
  confirmedDate: string | null
  scheduleDate: string | null
  receiptUrl: string | null
  value: number | null
  authorized: boolean | null
}

function soData(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, 10) : null
}

/**
 * Extrai os campos relevantes do payload do webhook.
 * O ASAAS envia `{ event, transfer: {...} }`; alguns eventos trazem
 * dados da transação Pix aninhada em `transfer.pixTransaction`.
 */
export function extrairCamposTransfer(body: any): CamposTransfer {
  const t = body?.transfer ?? body ?? {}
  const pix = t?.pixTransaction ?? body?.pixTransaction ?? {}
  return {
    asaasTransferId: t?.id ?? null,
    externalReference: t?.externalReference ?? null,
    asaasStatus: t?.status ?? pix?.status ?? null,
    failReason: t?.failReason ?? null,
    refusalReason: t?.refusalReason ?? pix?.refusalReason ?? null,
    endToEndIdentifier: t?.endToEndIdentifier ?? pix?.endToEndIdentifier ?? null,
    effectiveDate: soData(t?.effectiveDate ?? pix?.effectiveDate),
    confirmedDate: soData(t?.confirmedDate),
    scheduleDate: soData(t?.scheduleDate ?? pix?.scheduledDate),
    receiptUrl: t?.transactionReceiptUrl ?? pix?.transactionReceiptUrl ?? null,
    value: typeof t?.value === 'number' ? t.value : null,
    authorized: typeof t?.authorized === 'boolean' ? t.authorized : null,
  }
}

/** Rótulos em pt-BR usados na interface do Financeiro. */
export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  agendado: 'Agendado',
  pendente: 'Aguardando processamento',
  processando: 'Em processamento bancário',
  bloqueado: 'Bloqueado',
  concluido: 'Concluído',
  falhou: 'Falhou',
  cancelado: 'Cancelado',
}
