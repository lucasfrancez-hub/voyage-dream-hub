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
  direction: 'in' | 'out'
  counterpartyLabel: string
  instituicao: string | null
  chavePix: string | null
  cpfCnpj: string | null
  descricao: string | null
  /** Forma de pagamento legível (Pix, Boleto, Cartão, TED...) */
  formaPagamento: string | null
  /** Data de vencimento (YYYY-MM-DD) quando aplicável */
  dueDate: string | null
  /** Data/hora efetiva do pagamento */
  paymentDate: string | null
  /** Identificador Pix ponta-a-ponta (E2E) — mesmo valor do comprovante oficial */
  endToEndId?: string | null
}

/** Extrai o identificador Pix (E2E) de qualquer payload ASAAS. */
export function e2eOf(x: any): string | null {
  return (
    x?.pixTransaction?.endToEndIdentifier ??
    x?.pixTransaction?.endToEndId ??
    x?.endToEndIdentifier ??
    x?.transactionReceiptId ??
    null
  )
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

/** Converte uma transferência ASAAS no formato de comprovante. */
export function mapTransfer(t: any): Comprovante {
  const dt = t?.effectiveDate ?? t?.dateCreated ?? t?.scheduleDate ?? null
  return {
    id: `transfer:${t?.id}`,
    kind: 'transfer',
    asaasId: String(t?.id ?? ''),
    date: dt,
    favored: favoredOfTransfer(t),
    value: Math.abs(Number(t?.value ?? 0)),
    operation: operationLabelTransfer(t),
    direction: 'out',
    counterpartyLabel: 'Favorecido',
    status: TRANSFER_STATUS[String(t?.status ?? '')] ?? t?.status ?? null,
    reference: t?.externalReference ?? t?.id ?? null,
    receiptUrl: t?.transactionReceiptUrl ?? null,
    instituicao: bankOfTransfer(t),
    chavePix: t?.pixAddressKey ?? t?.pixTransaction?.qrCode?.pixKey ?? null,
    cpfCnpj: docOfTransfer(t),
    descricao: t?.description ?? null,
    formaPagamento:
      String(t?.operationType ?? '').toUpperCase() === 'PIX'
        ? 'Pix'
        : String(t?.operationType ?? '').toUpperCase() === 'TED'
          ? 'TED'
          : 'Transferência',
    dueDate: t?.scheduleDate ?? null,
    paymentDate: t?.effectiveDate ?? t?.dateCreated ?? null,
  }
}

/** Converte uma cobrança ASAAS (recebimento) no formato de comprovante. */
export function mapPayment(p: any, cust?: any): Comprovante {
  const dt = p?.paymentDate ?? p?.clientPaymentDate ?? p?.confirmedDate ?? p?.dateCreated ?? null
  return {
    id: `payment:${p?.id}`,
    kind: 'payment',
    asaasId: String(p?.id ?? ''),
    date: dt,
    favored: cust?.name ?? cust?.company ?? p?.customerName ?? p?.description ?? null,
    value: Math.abs(Number(p?.value ?? 0)),
    operation: operationLabelPayment(p),
    direction: 'in',
    counterpartyLabel: 'Pagador',
    status: PAYMENT_STATUS[String(p?.status ?? '')] ?? p?.status ?? null,
    reference: p?.externalReference ?? p?.invoiceNumber ?? p?.id ?? null,
    receiptUrl: p?.transactionReceiptUrl ?? null,
    instituicao: p?.creditCard?.creditCardBrand ?? null,
    chavePix: p?.pixTransaction?.qrCode?.pixKey ?? p?.pixQrCodeId ?? null,
    cpfCnpj: digits(cust?.cpfCnpj ?? p?.customerCpfCnpj),
    descricao: p?.description ?? null,
    formaPagamento:
      String(p?.billingType ?? '').toUpperCase() === 'PIX'
        ? 'Pix'
        : String(p?.billingType ?? '').toUpperCase() === 'BOLETO'
          ? 'Boleto'
          : String(p?.billingType ?? '').toUpperCase() === 'CREDIT_CARD'
            ? 'Cartão de crédito'
            : null,
    dueDate: p?.dueDate ?? null,
    paymentDate: p?.clientPaymentDate ?? p?.paymentDate ?? p?.confirmedDate ?? null,
  }
}

/** Converte um pagamento de boleto ASAAS no formato de comprovante. */
export function mapBill(b: any): Comprovante {
  const dt = b?.paymentDate ?? b?.scheduleDate ?? b?.dateCreated ?? null
  return {
    id: `bill:${b?.id}`,
    kind: 'bill',
    asaasId: String(b?.id ?? ''),
    date: dt,
    favored: b?.companyName ?? b?.beneficiaryName ?? b?.description ?? null,
    value: Math.abs(Number(b?.value ?? 0)),
    operation: 'Boleto pago',
    direction: 'out',
    counterpartyLabel: 'Beneficiário',
    status: BILL_STATUS[String(b?.status ?? '')] ?? b?.status ?? null,
    reference: b?.externalReference ?? b?.id ?? null,
    receiptUrl: b?.transactionReceiptUrl ?? null,
    instituicao: b?.bankSlipInfo?.bankName ?? b?.bankName ?? null,
    chavePix: null,
    cpfCnpj: digits(b?.cpfCnpj ?? b?.beneficiaryCpfCnpj),
    descricao: b?.description ?? b?.identificationField ?? null,
    formaPagamento: 'Boleto',
    dueDate: b?.dueDate ?? null,
    paymentDate: b?.paymentDate ?? null,
  }
}

/** Busca o comprovante completo de uma única movimentação, direto na API. */
export async function fetchComprovanteById(args: {
  paymentId?: string | null
  transferId?: string | null
  billId?: string | null
}): Promise<Comprovante | null> {
  const asaas = await import('@/lib/asaas.server')
  if (args.transferId) {
    const t = await asaas.getAsaasTransfer(args.transferId).catch(() => null)
    if (t) return mapTransfer(t)
  }
  if (args.paymentId) {
    const p = await asaas.getAsaasPayment(args.paymentId).catch(() => null)
    if (p) {
      const cid = typeof p?.customer === 'string' ? p.customer : p?.customer?.id
      const cust = cid ? await asaas.getAsaasCustomer(cid).catch(() => null) : null
      return mapPayment(p, cust)
    }
  }
  if (args.billId) {
    const b = await asaas.getAsaasBill(args.billId).catch(() => null)
    if (b) return mapBill(b)
  }
  return null
}



/** Busca comprovantes de transferências, cobranças e boletos no período. */
export async function fetchComprovantes(range: {
  startDate: string
  finishDate: string
}): Promise<Comprovante[]> {
  const { listAsaasTransfers, listAsaasPayments, listAsaasBills } = await import('@/lib/asaas.server')

  const { getAsaasCustomer } = await import('@/lib/asaas.server')
  const [transfers, payments, bills] = await Promise.all([
    listAsaasTransfers(range).catch(() => [] as any[]),
    listAsaasPayments(range).catch(() => [] as any[]),
    listAsaasBills(range).catch(() => [] as any[]),
  ])

  const out: Comprovante[] = []

  for (const t of transfers) {
    const dt = t?.effectiveDate ?? t?.dateCreated ?? t?.scheduleDate ?? null
    if (!inRange(dt, range.startDate, range.finishDate)) continue
    out.push(mapTransfer(t))
  }


  const customerIds = Array.from(
    new Set(
      payments
        .map((p: any) => (typeof p?.customer === 'string' ? p.customer : p?.customer?.id))
        .filter(Boolean) as string[],
    ),
  ).slice(0, 60)
  const customers = new Map<string, any>()
  await Promise.all(
    customerIds.map(async (id) => {
      const c = await getAsaasCustomer(id).catch(() => null)
      if (c) customers.set(id, c)
    }),
  )

  for (const p of payments) {
    const cid = typeof p?.customer === 'string' ? p.customer : p?.customer?.id
    const cust = cid ? customers.get(cid) : null
    const dt = p?.paymentDate ?? p?.clientPaymentDate ?? p?.confirmedDate ?? p?.dateCreated ?? null
    if (!inRange(dt, range.startDate, range.finishDate)) continue
    out.push(mapPayment(p, cust))
  }

  for (const b of bills) {
    const dt = b?.paymentDate ?? b?.scheduleDate ?? b?.dateCreated ?? null
    if (!inRange(dt, range.startDate, range.finishDate)) continue
    out.push(mapBill(b))
  }


  out.sort((a, z) => String(z.date ?? '').localeCompare(String(a.date ?? '')))
  return out
}

/** Índice id ASAAS -> comprovante completo, para enriquecer o extrato. */
export async function buildComprovanteIndex(range: { startDate: string; finishDate: string }) {
  const list = await fetchComprovantes(range)
  const map = new Map<string, Comprovante>()
  for (const c of list) if (c.asaasId) map.set(c.asaasId, c)
  return map
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
