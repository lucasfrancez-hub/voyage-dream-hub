/**
 * Operações REAIS de pagamento da Comprar Viagem / Oner.
 *
 * Mapeadas a partir da própria aplicação de checkout do fornecedor:
 *   GET  {api}/booking/installments/{cartId}?total=&paymentMethodId=
 *   POST {api}/booking/installments/{cartId}      (parcelas por cartão, via cofre)
 *   POST {api}/booking/payNotification            (pagamento)
 *   POST {api}/booking/pay/combined/pix
 *   POST {api}/booking/pay/combined/retention/credit-card
 *   PUT  {api}/booking/pay/cancel/{cartId}
 *   POST https://api.vault.onertravel.com/vault/store   (cofre do cartão)
 *
 * REGRAS ABSOLUTAS:
 * - Nada de parcelamento, bandeira, juros ou valor calculado localmente:
 *   tudo vem do fornecedor.
 * - PAN e CVV NUNCA são persistidos nem registrados em log. Eles só trafegam
 *   uma única vez para o cofre (vault) do fornecedor, que devolve um token.
 * SERVER-ONLY.
 */
import { onerFetch, type OnerCall } from "./client.server";
import { ONER_API } from "./config";

const VAULT_URL = "https://api.vault.onertravel.com/vault/store";

/** Formas de pagamento reais do fornecedor. */
export const ONER_PAYMENT_METHOD = {
  CreditCard: 1,
  DebitCard: 3,
  Pix: 4,
  Invoiced: 5,
} as const;

export type OnerInstallmentOption = {
  installment: number;
  installmentsValue: number;
  total: number;
  interestRate: number;
  hasRate: boolean;
  firstInstallmentAddition: number;
  split: boolean;
};

export type OnerVaultCard = {
  Token: string;
  Key: string;
  Brand: string;
  CardBin: string;
  LastDigts: string;
};

export type DadosCartaoSensiveis = {
  /** Nome impresso no cartão. */
  nome: string;
  /** Somente dígitos ou com espaços; nunca é salvo. */
  numero: string;
  /** Nunca é salvo. */
  cvv: string;
  /** MM */
  mesValidade: string;
  /** AAAA ou AA */
  anoValidade: string;
};

function normalizarValidade(mes: string, ano: string) {
  const m = String(mes ?? "").replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  const a = String(ano ?? "").replace(/\D/g, "");
  const ano4 = a.length === 2 ? `20${a}` : a;
  return { mes: m, ano: ano4, expirationDate: `${m}/${ano4}` };
}

/**
 * Envia o cartão ao cofre do fornecedor e devolve apenas token/bandeira/BIN.
 * O número e o CVV não saem daqui e não são gravados em lugar nenhum.
 */
export async function guardarCartaoNoCofre(
  cartao: DadosCartaoSensiveis,
): Promise<{ ok: boolean; cofre: OnerVaultCard | null; mensagem?: string }> {
  const v = normalizarValidade(cartao.mesValidade, cartao.anoValidade);
  const corpo = {
    CardHolder: String(cartao.nome ?? ""),
    CVV: String(cartao.cvv ?? ""),
    CardNumber: String(cartao.numero ?? "").replace(/\s/g, ""),
    ExpirationDate: v.expirationDate,
  };

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const res = await fetch(VAULT_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(30_000),
      });
      const texto = await res.text();
      if (!res.ok) {
        if (tentativa === 3) {
          return { ok: false, cofre: null, mensagem: `cofre respondeu ${res.status}` };
        }
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      const body = texto ? (JSON.parse(texto) as OnerVaultCard) : null;
      if (!body?.Token || !body?.Key) {
        return { ok: false, cofre: null, mensagem: "cofre não devolveu token" };
      }
      return { ok: true, cofre: body };
    } catch (e) {
      if (tentativa === 3) {
        return { ok: false, cofre: null, mensagem: e instanceof Error ? e.message : String(e) };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { ok: false, cofre: null, mensagem: "cofre indisponível" };
}

/** Parcelas do carrinho inteiro (sem cartão informado). */
export async function consultarParcelas(
  token: string,
  cartId: string,
  total: number,
  paymentMethodId: number = ONER_PAYMENT_METHOD.CreditCard,
): Promise<{ call: OnerCall; opcoes: OnerInstallmentOption[] }> {
  const url = `${ONER_API}/booking/installments/${cartId}?total=${total}&paymentMethodId=${paymentMethodId}`;
  const r = await onerFetch<OnerInstallmentOption[]>(url, { token });
  return { call: r.call, opcoes: Array.isArray(r.body) ? r.body : [] };
}

/**
 * Parcelas reais de UM cartão específico (após o cofre).
 * É esta a consulta usada quando há 1, 2 ou 3 cartões.
 */
export async function consultarParcelasDoCartao(
  token: string,
  cartId: string,
  entrada: { totalValue: number; vaultToken: string; vaultKey: string; multiplosCartoes: boolean },
): Promise<{ call: OnerCall; opcoes: OnerInstallmentOption[] }> {
  const url = `${ONER_API}/booking/installments/${cartId}`;
  const r = await onerFetch<OnerInstallmentOption[]>(url, {
    token,
    method: "POST",
    body: {
      totalValue: entrada.totalValue,
      paymentMethodId: ONER_PAYMENT_METHOD.CreditCard,
      isMultiplePayment: entrada.multiplosCartoes,
      vaultToken: entrada.vaultToken,
      vaultKey: entrada.vaultKey,
    },
  });
  return { call: r.call, opcoes: Array.isArray(r.body) ? r.body : [] };
}

/** Um cartão já protegido pelo cofre, pronto para o pagamento. */
export type CartaoParaPagamento = {
  installments: number;
  value: number;
  interestRate: number;
  creditCard: {
    vaultToken: string;
    vaultKey: string;
    brand: string;
    bin: string;
    lastNumbers: string;
    name: string;
    documentTypeId: number;
    documentNumber: string;
    expirationMonth: number;
    expirationYear: number;
  };
};

export type PagamentoCartaoEntrada = {
  cartId: string;
  cartoes: CartaoParaPagamento[];
  purchaseForCustomer: boolean;
  acceptedInsuranceTerm?: boolean;
  coupon?: string;
};

export type OnerPurchaseResult = {
  reservationCode?: string | null;
  wasChanged?: boolean;
  cartExpired?: boolean;
  paymentError?: boolean;
};

function montarPagamento(entrada: PagamentoCartaoEntrada) {
  return {
    paymentMethod: ONER_PAYMENT_METHOD.CreditCard,
    sourceIp: "",
    creditCardPayments: entrada.cartoes,
    cartId: entrada.cartId,
    paymentHubId: "null",
    fingerprint: "",
    coupon: entrada.coupon ?? "",
    submitPaymentStr: new Date().toISOString().replace(/\.\d+Z$/, " GMT+00:00"),
    purchaseForCustomer: entrada.purchaseForCustomer,
    acceptedTerms: { insuranceCloseCheckIn: entrada.acceptedInsuranceTerm ?? false },
  };
}

/** Pagamento com 1, 2 ou 3 cartões (sem Pix combinado). */
export async function pagarComCartoes(
  token: string,
  entrada: PagamentoCartaoEntrada,
): Promise<{ call: OnerCall; compra: OnerPurchaseResult | null; raw: string }> {
  const url = `${ONER_API}/booking/payNotification`;
  const r = await onerFetch<{ purchase?: OnerPurchaseResult } & OnerPurchaseResult>(url, {
    token,
    method: "POST",
    body: { payment: montarPagamento(entrada) },
    timeoutMs: 120_000,
  });
  const compra = (r.body?.purchase ?? r.body ?? null) as OnerPurchaseResult | null;
  return { call: r.call, compra, raw: r.raw };
}

/** Pagamento combinado Pix + cartão (retenção), quando o fornecedor exigir. */
export async function pagarPixMaisCartoes(
  token: string,
  entrada: PagamentoCartaoEntrada & { valorPix: number },
): Promise<{ call: OnerCall; compra: OnerPurchaseResult | null; raw: string }> {
  const url = `${ONER_API}/booking/pay/combined/retention/credit-card`;
  const r = await onerFetch<{ purchase?: OnerPurchaseResult } & OnerPurchaseResult>(url, {
    token,
    method: "POST",
    body: { payment: montarPagamento(entrada), valueToPay: entrada.valorPix },
    timeoutMs: 120_000,
  });
  const compra = (r.body?.purchase ?? r.body ?? null) as OnerPurchaseResult | null;
  return { call: r.call, compra, raw: r.raw };
}

/** Cancela um pagamento pendente do carrinho. */
export async function cancelarPagamento(token: string, cartId: string) {
  const r = await onerFetch(`${ONER_API}/booking/pay/cancel/${cartId}`, { token, method: "PUT" });
  return r.call;
}
