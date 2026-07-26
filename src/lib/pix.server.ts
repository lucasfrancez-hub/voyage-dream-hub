/**
 * Helpers de servidor para chamar o proxy mTLS do Itaú Pix.
 * NÃO importar deste arquivo a partir do client (nome .server.ts bloqueia).
 */

interface ProxyEnv {
  url: string
  secret: string
  chave: string
}

function readProxyEnv(): ProxyEnv {
  const url = process.env.PIX_PROXY_URL
  const secret = process.env.PIX_PROXY_SECRET
  const chave = process.env.PIX_CHAVE
  if (!url || !secret || !chave) {
    throw new Error(
      'PIX indisponível — configure PIX_PROXY_URL, PIX_PROXY_SECRET e PIX_CHAVE nos secrets do Lovable.',
    )
  }
  return { url: url.replace(/\/+$/, ''), secret, chave }
}

/** Gera txid EMV compatível: 26 a 35 caracteres alfanuméricos. */
export function makeTxid(orderNumber: string): string {
  const clean = String(orderNumber || '').replace(/[^a-zA-Z0-9]/g, '')
  const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 12)
  const raw = `VA${clean}${rand}${Date.now().toString(36)}`
  return raw.slice(0, 32).padEnd(26, '0')
}

export interface CreateCobrancaInput {
  txid: string
  valor: number
  expiracao_seg?: number
  devedor?: { cpf?: string; cnpj?: string; nome: string }
  solicitacao?: string
}

export interface CobrancaResponse {
  txid: string
  status: string
  pixCopiaECola: string
  location?: any
  expiracao_seg?: number
  criacao?: string
  valor?: string
  raw?: any
}

export async function createPixCobranca(input: CreateCobrancaInput): Promise<CobrancaResponse> {
  const env = readProxyEnv()
  const res = await fetch(`${env.url}/pix/cobranca`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': env.secret,
    },
    body: JSON.stringify({
      txid: input.txid,
      valor: Number(input.valor).toFixed(2),
      chave: env.chave,
      expiracao_seg: input.expiracao_seg ?? 1800,
      devedor: input.devedor,
      infoAdicionais: input.solicitacao
        ? [{ nome: 'Pedido', valor: input.solicitacao }]
        : undefined,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Itaú Pix (${res.status}): ${JSON.stringify(body).slice(0, 300)}`)
  }
  return body as CobrancaResponse
}

export async function readPixCobranca(txid: string) {
  const env = readProxyEnv()
  const res = await fetch(`${env.url}/pix/cob/${encodeURIComponent(txid)}`, {
    method: 'GET',
    headers: { 'X-Proxy-Secret': env.secret },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Itaú Pix consulta (${res.status})`)
  return body
}
