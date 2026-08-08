/**
 * Cliente HTTP do ASAAS (Pix — recebimentos).
 * Arquivo .server.ts: nunca importar do client.
 *
 * ASAAS_API_KEY  -> chave de API (produção: começa com $aact_prod_ / sandbox: $aact_hmlg_)
 * ASAAS_ENV      -> opcional: "sandbox" força a base de homologação.
 */

function baseUrl(): string {
  const key = process.env['ASAAS_API_KEY'] || ''
  const forced = (process.env['ASAAS_ENV'] || '').toLowerCase()
  const sandbox = forced === 'sandbox' || key.includes('hmlg') || key.includes('sandbox')
  return sandbox
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3'
}

async function asaasFetch(path: string, init?: RequestInit): Promise<any> {
  const key = process.env['ASAAS_API_KEY']
  if (!key) throw new Error('ASAAS_API_KEY não configurada.')
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: key,
      'User-Agent': 'VIA AIR',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      body?.errors?.map((e: any) => e.description).join(' | ') ||
      JSON.stringify(body).slice(0, 300)
    throw new Error(`ASAAS (${res.status}): ${msg}`)
  }
  return body
}

export interface EnsureCustomerInput {
  name: string
  cpfCnpj?: string | null
  email?: string | null
  phone?: string | null
  externalReference?: string | null
}

/** Busca cliente pelo CPF/CNPJ; cria se não existir. */
export async function ensureAsaasCustomer(input: EnsureCustomerInput): Promise<string> {
  const doc = String(input.cpfCnpj || '').replace(/\D/g, '')
  if (doc) {
    const found = await asaasFetch(`/customers?cpfCnpj=${doc}&limit=1`)
    const id = found?.data?.[0]?.id
    if (id) {
      // Garante que o ASAAS não dispare e-mail/SMS/WhatsApp para o cliente.
      if (found?.data?.[0]?.notificationDisabled !== true) {
        await asaasFetch(`/customers/${id}`, {
          method: 'POST',
          body: JSON.stringify({ notificationDisabled: true }),
        }).catch(() => null)
      }
      return id
    }
  }
  const created = await asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name || 'Cliente VIA AIR',
      cpfCnpj: doc || undefined,
      email: input.email || undefined,
      mobilePhone: input.phone ? String(input.phone).replace(/\D/g, '') : undefined,
      externalReference: input.externalReference || undefined,
      notificationDisabled: true,
    }),
  })
  if (!created?.id) throw new Error('ASAAS: não foi possível criar o cliente.')
  return created.id as string
}

export interface CreatePixPaymentInput {
  customerId: string
  value: number
  description?: string
  externalReference?: string
  /** minutos até expirar o QR (default 30) */
  expiresInMinutes?: number
}

export interface AsaasPixPayment {
  paymentId: string
  payload: string
  encodedImage: string | null
  expirationDate: string | null
  /** instante real de expiração do QR (ISO) */
  expiresAt: string
  invoiceUrl: string | null
  raw: any
}

/** Data (YYYY-MM-DD) do instante informado no fuso de São Paulo */
function brtDateStr(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export async function createAsaasPixPayment(
  input: CreatePixPaymentInput,
): Promise<AsaasPixPayment> {
  const minutes = Math.max(input.expiresInMinutes ?? 30, 1)
  const expiresAt = new Date(Date.now() + minutes * 60_000)
  // ASAAS aceita apenas data (sem hora) no vencimento: usamos a data local (BRT)
  // do instante em que o QR expira, para o e-mail do ASAAS não divergir do QR.
  const dueDateStr = brtDateStr(expiresAt)

  const payment = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customerId,
      billingType: 'PIX',
      value: Number(input.value.toFixed(2)),
      dueDate: dueDateStr,
      description: input.description,
      externalReference: input.externalReference,
      postalService: false,
    }),
  })

  // Desliga qualquer régua de notificação (e-mail/SMS/WhatsApp) da cobrança.
  await asaasFetch(`/payments/${payment.id}/notifications`, {
    method: 'PUT',
    body: JSON.stringify({
      notifications: ['PAYMENT_CREATED', 'PAYMENT_DUEDATE_WARNING', 'PAYMENT_RECEIVED', 'SEND_LINHA_DIGITAVEL', 'PAYMENT_OVERDUE'].map((event) => ({
        event,
        enabled: false,
        emailEnabledForProvider: false,
        smsEnabledForProvider: false,
        emailEnabledForCustomer: false,
        smsEnabledForCustomer: false,
        phoneCallEnabledForCustomer: false,
        whatsappEnabledForCustomer: false,
      })),
    }),
  }).catch(() => null)

  const qr = await asaasFetch(`/payments/${payment.id}/pixQrCode`, {
    method: 'POST',
    body: JSON.stringify({ expirationSeconds: minutes * 60 }),
  }).catch(() => null)

  const qrData = qr?.payload ? qr : await asaasFetch(`/payments/${payment.id}/pixQrCode`)
  if (!qrData?.payload) throw new Error('ASAAS: QR Code Pix não retornado.')

  return {
    paymentId: payment.id,
    payload: qrData.payload,
    encodedImage: qrData.encodedImage ?? null,
    expirationDate: qrData.expirationDate ?? null,
    expiresAt: expiresAt.toISOString(),
    invoiceUrl: payment.invoiceUrl ?? null,
    raw: { payment, qr: qrData },
  }
}


export interface CreateChargeInput {
  customerId: string
  billingType: 'PIX' | 'BOLETO'
  value: number
  dueDate: string
  description?: string | null
  externalReference?: string | null
  /** Multa por atraso, em % do valor. */
  finePercent?: number | null
  /** Juros ao mês por atraso, em %. */
  interestPercent?: number | null
}

/** Cria uma cobrança avulsa (Pix ou boleto) sem notificações do ASAAS. */
export async function createAsaasCharge(input: CreateChargeInput) {
  const payment = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customerId,
      billingType: input.billingType,
      value: Number(input.value.toFixed(2)),
      dueDate: input.dueDate,
      description: input.description ?? undefined,
      externalReference: input.externalReference ?? undefined,
      postalService: false,
      ...(input.finePercent
        ? { fine: { value: Number(input.finePercent), type: 'PERCENTAGE' } }
        : {}),
      ...(input.interestPercent
        ? { interest: { value: Number(input.interestPercent) } }
        : {}),
    }),
  })


  await asaasFetch(`/payments/${payment.id}/notifications`, {
    method: 'PUT',
    body: JSON.stringify({
      notifications: [
        'PAYMENT_CREATED',
        'PAYMENT_DUEDATE_WARNING',
        'PAYMENT_RECEIVED',
        'SEND_LINHA_DIGITAVEL',
        'PAYMENT_OVERDUE',
      ].map((event) => ({
        event,
        enabled: false,
        emailEnabledForProvider: false,
        smsEnabledForProvider: false,
        emailEnabledForCustomer: false,
        smsEnabledForCustomer: false,
        phoneCallEnabledForCustomer: false,
        whatsappEnabledForCustomer: false,
      })),
    }),
  }).catch(() => null)

  let pix: any = null
  let identificationField: string | null = null
  // Boleto no ASAAS é híbrido: também expõe QR Code Pix. Buscamos os dois.
  pix = await asaasFetch(`/payments/${payment.id}/pixQrCode`).catch(() => null)
  if (input.billingType !== 'PIX') {
    const idf = await asaasFetch(`/payments/${payment.id}/identificationField`).catch(() => null)
    identificationField = idf?.identificationField ?? null
  }


  return {
    paymentId: String(payment.id),
    invoiceUrl: payment.invoiceUrl ?? null,
    bankSlipUrl: payment.bankSlipUrl ?? null,
    identificationField,
    pixPayload: pix?.payload ?? null,
    pixEncodedImage: pix?.encodedImage ?? null,
    pixExpiration: pix?.expirationDate ?? null,
    raw: { payment, pix },
  }
}

export async function getAsaasCustomer(customerId: string) {
  return asaasFetch(`/customers/${encodeURIComponent(customerId)}`)
}

export async function deleteAsaasPayment(paymentId: string) {
  return asaasFetch(`/payments/${encodeURIComponent(paymentId)}`, { method: 'DELETE' })
}

export async function getAsaasPayment(paymentId: string) {
  return asaasFetch(`/payments/${encodeURIComponent(paymentId)}`)
}

/* ============================================================
 * TRANSFERÊNCIAS PIX (saques)
 * ============================================================ */

export interface CreatePixTransferInput {
  value: number
  pixKey: string
  pixKeyType?: string | null
  description?: string | null
  /** YYYY-MM-DD — quando informado, agenda o pagamento */
  scheduleDate?: string | null
  externalReference?: string | null
}

export async function createAsaasPixTransfer(input: CreatePixTransferInput) {
  const body: Record<string, unknown> = {
    value: Number(input.value.toFixed(2)),
    operationType: 'PIX',
    pixAddressKey: input.pixKey,
    description: input.description || undefined,
    externalReference: input.externalReference || undefined,
  }
  if (input.pixKeyType) body['pixAddressKeyType'] = input.pixKeyType
  if (input.scheduleDate) body['scheduleDate'] = input.scheduleDate
  return asaasFetch('/transfers', { method: 'POST', body: JSON.stringify(body) })
}

export async function getAsaasTransfer(transferId: string) {
  return asaasFetch(`/transfers/${encodeURIComponent(transferId)}`)
}

export async function cancelAsaasTransfer(transferId: string) {
  try {
    return await asaasFetch(`/transfers/${encodeURIComponent(transferId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  } catch {
    return asaasFetch(`/transfers/${encodeURIComponent(transferId)}`, { method: 'DELETE' })
  }
}

/* ============================================================
 * CONTA BANCÁRIA (saldo + extrato)
 * ============================================================ */

/** Saldo disponível da conta ASAAS. */
export async function getAsaasBalance(): Promise<number> {
  const res = await asaasFetch('/finance/balance')
  return Number(res?.balance ?? 0)
}

export interface AsaasStatementParams {
  startDate: string // yyyy-mm-dd
  finishDate: string // yyyy-mm-dd
  offset?: number
  limit?: number
}

/** Extrato (financial transactions) da conta ASAAS. */
export async function getAsaasStatement(params: AsaasStatementParams) {
  const q = new URLSearchParams({
    startDate: params.startDate,
    finishDate: params.finishDate,
    offset: String(params.offset ?? 0),
    limit: String(Math.min(params.limit ?? 50, 100)),
    order: 'desc',
  })
  return asaasFetch(`/financialTransactions?${q.toString()}`)
}

/* ============================================================
 * PAGUE CONTAS (boletos)
 * ============================================================ */

export interface BillSimulationResult {
  identificationField?: string
  barCode?: string
  value?: number
  discount?: number
  interest?: number
  fine?: number
  totalValue?: number
  dueDate?: string
  companyName?: string
  beneficiaryName?: string
  canBePaidWithBalance?: boolean
  [k: string]: any
}

/** Valida/interpreta a linha digitável no ASAAS antes de pagar. */
export async function simulateAsaasBill(identificationField: string): Promise<BillSimulationResult> {
  return asaasFetch('/bill/simulate', {
    method: 'POST',
    body: JSON.stringify({ identificationField }),
  })
}

export interface CreateBillInput {
  identificationField: string
  scheduleDate?: string | null
  description?: string | null
  value?: number | null
  dueDate?: string | null
  externalReference?: string | null
}

/** Cria o pagamento (imediato ou agendado) de um boleto. */
export async function createAsaasBill(input: CreateBillInput) {
  const body: Record<string, any> = {
    identificationField: input.identificationField,
  }
  if (input.scheduleDate) body['scheduleDate'] = input.scheduleDate
  if (input.description) body['description'] = input.description
  if (input.value != null) body['value'] = input.value
  if (input.dueDate) body['dueDate'] = input.dueDate
  if (input.externalReference) body['externalReference'] = input.externalReference
  return asaasFetch('/bill', { method: 'POST', body: JSON.stringify(body) })
}

export async function getAsaasBill(billId: string) {
  return asaasFetch(`/bill/${encodeURIComponent(billId)}`)
}

export async function cancelAsaasBill(billId: string) {
  return asaasFetch(`/bill/${encodeURIComponent(billId)}/cancel`, { method: 'POST' })
}

/* ============================================================
 * CONSULTA DE CHAVE PIX (DICT)
 * ============================================================ */

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'

/** Detecta o tipo da chave Pix informada. */
export function detectPixKeyType(raw: string): PixKeyType | null {
  const key = String(raw || '').trim()
  if (!key) return null
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) return 'EMAIL'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return 'EVP'
  const digits = key.replace(/\D/g, '')
  if (/^\+/.test(key) || (digits.length >= 10 && digits.length <= 13 && digits.length !== 11 && digits.length !== 14)) {
    if (digits.length >= 10 && digits.length <= 13) return 'PHONE'
  }
  if (digits.length === 11) return key.startsWith('+') ? 'PHONE' : 'CPF'
  if (digits.length === 14) return 'CNPJ'
  if (digits.length >= 10 && digits.length <= 13) return 'PHONE'
  return null
}

/** Normaliza a chave para o formato aceito pelo DICT. */
export function normalizePixKey(raw: string, type: PixKeyType | null): string {
  const key = String(raw || '').trim()
  if (type === 'CPF' || type === 'CNPJ') return key.replace(/\D/g, '')
  if (type === 'PHONE') {
    const d = key.replace(/\D/g, '')
    return `+${d.startsWith('55') ? d : `55${d}`}`
  }
  if (type === 'EMAIL') return key.toLowerCase()
  return key
}

function pixTlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

function pixCrc16(payload: string) {
  let crc = 0xffff
  for (const ch of payload) {
    crc ^= ch.charCodeAt(0) << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Monta um BR Code estático mínimo para a chave (usado só na consulta DICT). */
function staticPixPayload(key: string) {
  const mai = pixTlv('00', 'br.gov.bcb.pix') + pixTlv('01', key)
  const base =
    pixTlv('00', '01') +
    pixTlv('26', mai) +
    pixTlv('52', '0000') +
    pixTlv('53', '986') +
    pixTlv('58', 'BR') +
    pixTlv('59', 'N') +
    pixTlv('60', 'SAO PAULO') +
    pixTlv('62', pixTlv('05', '***')) +
    '6304'
  return base + pixCrc16(base)
}

export interface PixKeyOwner {
  pixKey: string
  pixKeyType: PixKeyType
  name: string
  cpfCnpj: string | null
  bankName: string | null
  ispb: string | null
  personType: string | null
}

/**
 * Consulta o titular da chave Pix no DICT (via decode do ASAAS).
 * Lança erro quando a chave não existe ou não pode receber.
 */
export async function lookupAsaasPixKey(rawKey: string): Promise<PixKeyOwner> {
  const type = detectPixKeyType(rawKey)
  if (!type) throw new Error('Não foi possível localizar esta chave Pix. Confira os dados e tente novamente.')
  const key = normalizePixKey(rawKey, type)

  let decoded: any
  try {
    decoded = await asaasFetch('/pix/qrCodes/decode', {
      method: 'POST',
      body: JSON.stringify({ payload: staticPixPayload(key) }),
    })
  } catch {
    throw new Error('Não foi possível localizar esta chave Pix. Confira os dados e tente novamente.')
  }

  const receiver = decoded?.receiver
  if (!receiver?.name || decoded?.canBePaid === false) {
    throw new Error('Não foi possível localizar esta chave Pix. Confira os dados e tente novamente.')
  }

  return {
    pixKey: key,
    pixKeyType: type,
    name: String(receiver.name),
    cpfCnpj: receiver.cpfCnpj ?? null,
    bankName: receiver.ispbName ?? null,
    ispb: receiver.ispb ?? null,
    personType: receiver.personType ?? null,
  }
}

/* ============================================================
 * COMPROVANTES (transferências, cobranças e boletos pagos)
 * ============================================================ */

export interface AsaasListRange {
  startDate: string // yyyy-mm-dd
  finishDate: string // yyyy-mm-dd
  limit?: number
}

/** Transferências (Pix/TED de saída) do período. */
export async function listAsaasTransfers(range: AsaasListRange) {
  const q = new URLSearchParams({
    'dateCreated[ge]': range.startDate,
    'dateCreated[le]': range.finishDate,
    limit: String(Math.min(range.limit ?? 100, 100)),
  })
  const res = await asaasFetch(`/transfers?${q.toString()}`)
  return (res?.data ?? []) as any[]
}

/** Cobranças recebidas no período. */
export async function listAsaasPayments(range: AsaasListRange) {
  const q = new URLSearchParams({
    'paymentDate[ge]': range.startDate,
    'paymentDate[le]': range.finishDate,
    limit: String(Math.min(range.limit ?? 100, 100)),
  })
  const res = await asaasFetch(`/payments?${q.toString()}`)
  return (res?.data ?? []) as any[]
}

/** Pagamentos de contas/boletos do período. */
export async function listAsaasBills(range: AsaasListRange) {
  const q = new URLSearchParams({ limit: String(Math.min(range.limit ?? 100, 100)) })
  const res = await asaasFetch(`/bill?${q.toString()}`).catch(() => ({ data: [] }))
  return (res?.data ?? []) as any[]
}

/** URL do comprovante de uma cobrança específica. */
export async function getAsaasPaymentReceiptUrl(paymentId: string): Promise<string | null> {
  const p = await getAsaasPayment(paymentId).catch(() => null)
  return p?.transactionReceiptUrl ?? null
}

/** URL do comprovante de uma transferência específica. */
export async function getAsaasTransferReceiptUrl(transferId: string): Promise<string | null> {
  const t = await getAsaasTransfer(transferId).catch(() => null)
  return t?.transactionReceiptUrl ?? null
}
