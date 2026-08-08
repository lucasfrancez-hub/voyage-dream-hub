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
    if (id) return id
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
    }),
  })

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


export async function getAsaasPayment(paymentId: string) {
  return asaasFetch(`/payments/${encodeURIComponent(paymentId)}`)
}
