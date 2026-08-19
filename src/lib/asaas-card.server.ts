/**
 * Cobrança por cartão + antecipação de recebíveis no ASAAS.
 * Arquivo .server.ts: nunca importar do client.
 *
 * Regras de segurança (briefing):
 *  - NUNCA persistir/logar número completo do cartão ou CVV.
 *  - Guardar apenas bandeira, últimos 4 dígitos, token (quando devolvido) e titular.
 *  - payment.id é o identificador principal de conciliação.
 */

import {
  asaasRequest,
  ensureAsaasCustomer,
  getAsaasPayment,
  type EnsureCustomerInput,
} from './asaas.server'

/* ─────────────── status interno ─────────────── */

export type StatusPagamento =
  | 'aprovado'
  | 'em_analise'
  | 'recusado'
  | 'erro'
  | 'indefinido'
  | 'recebido'
  | 'estornado'
  | 'estornado_parcial'
  | 'chargeback'

export const ROTULO_PAGAMENTO: Record<StatusPagamento, string> = {
  aprovado: 'APROVADO',
  em_analise: 'EM ANÁLISE DE RISCO',
  recusado: 'RECUSADO',
  erro: 'ERRO DE PROCESSAMENTO',
  indefinido: 'RESULTADO INDEFINIDO — CONSULTANDO TRANSAÇÃO',
  recebido: 'RECEBIDO (SALDO DISPONÍVEL)',
  estornado: 'ESTORNADO',
  estornado_parcial: 'ESTORNADO PARCIALMENTE',
  chargeback: 'CHARGEBACK ABERTO',
}

/** Traduz o status devolvido pelo ASAAS para o status interno da cobrança. */
export function mapStatusPagamento(asaasStatus?: string | null): StatusPagamento {
  const s = (asaasStatus || '').toUpperCase()
  if (s === 'CONFIRMED' || s === 'AUTHORIZED') return 'aprovado'
  if (s === 'RECEIVED' || s === 'RECEIVED_IN_CASH') return 'recebido'
  if (s === 'AWAITING_RISK_ANALYSIS') return 'em_analise'
  if (s === 'REPROVED_BY_RISK_ANALYSIS' || s === 'DECLINED' || s === 'REFUSED') return 'recusado'
  if (s === 'REFUNDED') return 'estornado'
  if (s === 'REFUND_REQUESTED' || s === 'REFUND_IN_PROGRESS') return 'estornado'
  if (s === 'PARTIALLY_REFUNDED') return 'estornado_parcial'
  if (s === 'CHARGEBACK_REQUESTED' || s === 'CHARGEBACK_DISPUTE' || s === 'AWAITING_CHARGEBACK_REVERSAL')
    return 'chargeback'
  if (s === 'PENDING') return 'indefinido'
  return 'indefinido'
}

/** Bandeira a partir dos dados devolvidos pelo ASAAS ou do BIN (fallback local). */
export function detectarBandeira(numero: string): string | null {
  const n = numero.replace(/\D/g, '')
  if (!n) return null
  if (/^4/.test(n)) return 'VISA'
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'MASTERCARD'
  if (/^3[47]/.test(n)) return 'AMEX'
  if (/^(36|38|30[0-5])/.test(n)) return 'DINERS'
  if (/^(606282|3841)/.test(n)) return 'HIPERCARD'
  if (/^(4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|650|651|655)/.test(n)) return 'ELO'
  return null
}

export interface CobrarCartaoInput {
  cliente: EnsureCustomerInput
  valor: number
  parcelas: number
  vencimento: string
  descricao?: string | null
  externalReference?: string | null
  cartao: {
    holderName: string
    number: string
    expiryMonth: string
    expiryYear: string
    ccv: string
  }
  titular: {
    name: string
    email: string
    cpfCnpj: string
    postalCode: string
    addressNumber: string
    addressComplement?: string | null
    phone?: string | null
  }
  remoteIp?: string | null
}

export interface RespostaCartao {
  ok: boolean
  status: StatusPagamento
  payment: any | null
  erroMensagem: string | null
  erroCodigo: string | null
  customerId: string
}

/** Cria e processa a cobrança no cartão. Nunca repete a tentativa automaticamente. */
export async function cobrarNoCartao(input: CobrarCartaoInput): Promise<RespostaCartao> {
  const customerId = await ensureAsaasCustomer(input.cliente)
  const parcelas = Math.max(1, Math.trunc(input.parcelas || 1))
  const valor = Number(input.valor.toFixed(2))

  const body: Record<string, unknown> = {
    customer: customerId,
    billingType: 'CREDIT_CARD',
    dueDate: input.vencimento,
    description: input.descricao ?? undefined,
    externalReference: input.externalReference ?? undefined,
    postalService: false,
    ...(parcelas > 1 ? { installmentCount: parcelas, totalValue: valor } : { value: valor }),
    creditCard: {
      holderName: input.cartao.holderName,
      number: input.cartao.number.replace(/\D/g, ''),
      expiryMonth: input.cartao.expiryMonth.padStart(2, '0'),
      expiryYear:
        input.cartao.expiryYear.length === 2 ? `20${input.cartao.expiryYear}` : input.cartao.expiryYear,
      ccv: input.cartao.ccv,
    },
    creditCardHolderInfo: {
      name: input.titular.name,
      email: input.titular.email,
      cpfCnpj: input.titular.cpfCnpj.replace(/\D/g, ''),
      postalCode: input.titular.postalCode.replace(/\D/g, ''),
      addressNumber: input.titular.addressNumber,
      addressComplement: input.titular.addressComplement || null,
      phone: input.titular.phone ? input.titular.phone.replace(/\D/g, '') : undefined,
    },
    ...(input.remoteIp ? { remoteIp: input.remoteIp } : {}),
  }

  try {
    const payment = await asaasRequest('/payments', { method: 'POST', body: JSON.stringify(body) })
    return {
      ok: true,
      status: mapStatusPagamento(payment?.status),
      payment,
      erroMensagem: null,
      erroCodigo: null,
      customerId,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao processar o cartão.'
    // Erro de negócio (400) = recusa; timeout/5xx = resultado indefinido (consultar depois).
    const recusa = /\(4\d\d\)/.test(msg)
    return {
      ok: false,
      status: recusa ? 'recusado' : 'erro',
      payment: null,
      erroMensagem: msg.replace(/\d{12,19}/g, '••••'),
      erroCodigo: recusa ? 'recusado' : 'falha_processamento',
      customerId,
    }
  }
}

/** Consulta a cobrança no ASAAS (usada após timeout, antes de qualquer nova tentativa). */
export async function consultarCobranca(paymentId: string) {
  return await getAsaasPayment(paymentId)
}

/** Busca a cobrança pelo externalReference — usado quando não temos o payment.id após timeout. */
export async function buscarCobrancaPorReferencia(externalReference: string) {
  const res = await asaasRequest(
    `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=10`,
  ).catch(() => null)
  return (res?.data ?? []) as any[]
}

/** Valor líquido / taxas da cobrança. */
export async function consultarValorLiquido(paymentId: string) {
  return await asaasRequest(`/payments/${encodeURIComponent(paymentId)}`).then((p) => ({
    netValue: p?.netValue ?? null,
    value: p?.value ?? null,
    status: p?.status ?? null,
  }))
}

/* ─────────────── antecipação de recebíveis ─────────────── */

/** Simulação: verifica elegibilidade e taxas antes de solicitar. */
export async function simularAntecipacao(params: { payment?: string; installment?: string }) {
  return await asaasRequest('/anticipations/simulate', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/** Solicita a antecipação de uma cobrança ou de um parcelamento. */
export async function solicitarAntecipacao(params: { payment?: string; installment?: string }) {
  return await asaasRequest('/anticipations', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function consultarAntecipacao(id: string) {
  return await asaasRequest(`/anticipations/${encodeURIComponent(id)}`)
}

export async function listarAntecipacoes(limit = 50) {
  const res = await asaasRequest(`/anticipations?limit=${Math.min(limit, 100)}`).catch(() => null)
  return (res?.data ?? []) as any[]
}

/** Extrato financeiro (conciliação): recebimentos, taxas, estornos e antecipações. */
export async function extratoFinanceiro(params: {
  startDate: string
  finishDate: string
  limit?: number
}) {
  const q = new URLSearchParams({
    startDate: params.startDate,
    finishDate: params.finishDate,
    limit: String(Math.min(params.limit ?? 100, 100)),
  })
  const res = await asaasRequest(`/financialTransactions?${q.toString()}`).catch(() => null)
  return (res?.data ?? []) as any[]
}
