/**
 * Comprovantes ASAAS — sempre consultados ao vivo na API (sem cópia estática).
 */

export type ComprovanteKind = 'transfer' | 'payment' | 'bill'

export interface Comprovante {
  id: string
  kind: ComprovanteKind
  asaasId: string
  date: string | null
  favored: string | null
  value: number
  operation: string
  status: string | null
  reference: string | null
  receiptUrl: string | null
  instituicao: string | null
  chavePix: string | null
  cpfCnpj: string | null
  descricao: string | null
}

const TRANSFER_STATUS: Record<string, string> = {
  PENDING: 'Pendente',
  BANK_PROCESSING: 'Processando',
  DONE: 'Concluído',
  CANCELLED: 'Cancelado',
  FAILED: 'Falhou',
  SCHEDULED: 'Agendado',
}

const PAYMENT_STATUS: Record<string, string> = {
  RECEIVED: 'Recebido',
  CONFIRMED: 'Confirmado',
  RECEIVED_IN_CASH: 'Recebido em dinheiro',
  REFUNDED: 'Estornado',
  PENDING: 'Pendente',
  OVERDUE: 'Vencido',
}

const BILL_STATUS: Record<string, string> = {
  PENDING: 'Pendente',
  BANK_PROCESSING: 'Processando',
  PAID: 'Pago',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
  SCHEDULED: 'Agendado',
}

function inRange(value: string | null | undefined, start: string, finish: string) {
  if (!value) return false
  const d = String(value).slice(0, 10)
  return d >= start && d <= finish
}

function operationLabelTransfer(t: any) {
  const op = String(t?.operationType ?? '').toUpperCase()
  if (op === 'PIX') return 'Pix enviado'
  if (op === 'TED') return 'TED enviada'
  if (op === 'INTERNAL') return 'Transferência interna'
  return 'Transferência enviada'
}

function operationLabelPayment(p: any) {
  const b = String(p?.billingType ?? '').toUpperCase()
  if (b === 'PIX') return 'Pix recebido'
  if (b === 'BOLETO') return 'Boleto recebido'
  if (b === 'CREDIT_CARD') return 'Cartão recebido'
  return 'Cobrança recebida'
}

function favoredOfTransfer(t: any): string | null {
  return (
    t?.bankAccount?.ownerName ??
    t?.pixAddressKeyOwner ??
    t?.account?.name ??
    t?.description ??
    null
  )
}

function digits(v: any): string | null {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 11 || d.length === 14 ? d : null
}

function bankOfTransfer(t: any): string | null {
  return (
    t?.bankAccount?.bank?.name ??
    t?.bankAccount?.ispbName ??
    t?.pixTransaction?.qrCode?.payer?.bankName ??
    t?.bankAccount?.bank?.ispb ??
    null
  )
}

function docOfTransfer(t: any): string | null {
  return (
    digits(t?.bankAccount?.cpfCnpj) ??
    digits(t?.pixAddressKeyOwnerCpfCnpj) ??
    digits(t?.cpfCnpj) ??
    (digits(t?.pixAddressKey) && String(t?.pixAddressKeyType ?? '').toUpperCase() === 'CPF'
      ? digits(t?.pixAddressKey)
      : null)
  )
}

/** Busca comprovantes de transferências, cobranças e boletos no período. */
export async function fetchComprovantes(range: {
  startDate: string
  finishDate: string
}): Promise<Comprovante[]> {
  const { listAsaasTransfers, listAsaasPayments, listAsaasBills } = await import('@/lib/asaas.server')

  const [transfers, payments, bills] = await Promise.all([
    listAsaasTransfers(range).catch(() => [] as any[]),
    listAsaasPayments(range).catch(() => [] as any[]),
    listAsaasBills(range).catch(() => [] as any[]),
  ])

  const out: Comprovante[] = []

  for (const t of transfers) {
    const dt = t?.effectiveDate ?? t?.dateCreated ?? t?.scheduleDate ?? null
    if (!inRange(dt, range.startDate, range.finishDate)) continue
    out.push({
      id: `transfer:${t?.id}`,
      kind: 'transfer',
      asaasId: String(t?.id ?? ''),
      date: dt,
      favored: favoredOfTransfer(t),
      value: Math.abs(Number(t?.value ?? 0)),
      operation: operationLabelTransfer(t),
      status: TRANSFER_STATUS[String(t?.status ?? '')] ?? t?.status ?? null,
      reference: t?.externalReference ?? t?.id ?? null,
      receiptUrl: t?.transactionReceiptUrl ?? null,
      instituicao: bankOfTransfer(t),
      chavePix: t?.pixAddressKey ?? t?.pixTransaction?.qrCode?.pixKey ?? null,
      cpfCnpj: docOfTransfer(t),
      descricao: t?.description ?? null,
    })
  }

  for (const p of payments) {
    const dt = p?.paymentDate ?? p?.clientPaymentDate ?? p?.confirmedDate ?? p?.dateCreated ?? null
    if (!inRange(dt, range.startDate, range.finishDate)) continue
    out.push({
      id: `payment:${p?.id}`,
      kind: 'payment',
      asaasId: String(p?.id ?? ''),
      date: dt,
      favored: p?.customerName ?? p?.description ?? null,
      value: Math.abs(Number(p?.value ?? 0)),
      operation: operationLabelPayment(p),
      status: PAYMENT_STATUS[String(p?.status ?? '')] ?? p?.status ?? null,
      reference: p?.externalReference ?? p?.invoiceNumber ?? p?.id ?? null,
      receiptUrl: p?.transactionReceiptUrl ?? null,
      instituicao: p?.creditCard?.creditCardBrand ?? null,
      chavePix: p?.pixTransaction?.qrCode?.pixKey ?? null,
      cpfCnpj: digits(p?.customerCpfCnpj),
      descricao: p?.description ?? null,
    })
  }

  for (const b of bills) {
    const dt = b?.paymentDate ?? b?.scheduleDate ?? b?.dateCreated ?? null
    if (!inRange(dt, range.startDate, range.finishDate)) continue
    out.push({
      id: `bill:${b?.id}`,
      kind: 'bill',
      asaasId: String(b?.id ?? ''),
      date: dt,
      favored: b?.companyName ?? b?.beneficiaryName ?? b?.description ?? null,
      value: Math.abs(Number(b?.value ?? 0)),
      operation: 'Boleto pago',
      status: BILL_STATUS[String(b?.status ?? '')] ?? b?.status ?? null,
      reference: b?.externalReference ?? b?.id ?? null,
      receiptUrl: b?.transactionReceiptUrl ?? null,
      instituicao: b?.bankSlipInfo?.bankName ?? b?.bankName ?? null,
      chavePix: null,
      cpfCnpj: digits(b?.cpfCnpj ?? b?.beneficiaryCpfCnpj),
      descricao: b?.description ?? b?.identificationField ?? null,
    })
  }

  out.sort((a, z) => String(z.date ?? '').localeCompare(String(a.date ?? '')))
  return out
}

/** Índice id ASAAS -> URL do comprovante, para anexar ao extrato. */
export async function buildReceiptIndex(range: { startDate: string; finishDate: string }) {
  const list = await fetchComprovantes(range)
  const map = new Map<string, string>()
  for (const c of list) {
    if (c.asaasId && c.receiptUrl) map.set(c.asaasId, c.receiptUrl)
  }
  return map
}
