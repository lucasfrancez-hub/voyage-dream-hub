/**
 * Montagem das formas de pagamento exibidas no orçamento público.
 *
 * Regras comerciais VIA AIR (fixas):
 * - Cartão: SEMPRE até 10x sem juros.
 * - Boleto: 10x sem juros, apenas quando a viagem tem antecedência mínima
 *   de 60 dias (e o orçamento é pacote).
 * - Pix: SEMPRE 5% de desconto.
 */
import type { Installment, PaymentConfiguration, QuoteType } from "./types";

/** Desconto padrão do Pix (mesma regra comercial da VIA AIR). */
export const PIX_DISCOUNT_PERCENT = 5;
/** Máximo de parcelas sem juros no cartão. */
export const CARD_MAX_INSTALLMENTS = 10;
/** Máximo de parcelas no boleto. */
export const BOLETO_MAX_INSTALLMENTS = 10;
/** Antecedência mínima (dias) da viagem para liberar boleto. */
export const BOLETO_MIN_DAYS = 60;

const CARD_BRANDS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Dias entre hoje e a data de início da viagem (null quando não há data). */
export function diasAteViagem(startDate?: string | null): number | null {
  if (!startDate) return null;
  const m = String(startDate).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const alvo = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((alvo - base) / 86_400_000);
}

/** Lista de parcelas de cartão sem juros (sempre 1x até 10x). */
export function cardInstallments(total: number, _airline?: string | null): Installment[] {
  const out: Installment[] = [];
  for (let n = 1; n <= CARD_MAX_INSTALLMENTS; n++) {
    out.push({ number: n, amount: round2(total / n), total: round2(total), interestFree: true });
  }
  return out;
}

/** Parcelas de boleto (pacotes): entrada + demais, sem juros. */
export function boletoInstallments(total: number, max = BOLETO_MAX_INSTALLMENTS): Installment[] {
  const out: Installment[] = [];
  for (let n = 1; n <= max; n++) {
    out.push({ number: n, amount: round2(total / n), total: round2(total), interestFree: true });
  }
  return out;
}

export function buildPayment(params: {
  type: QuoteType;
  total: number;
  airline?: string | null;
  /** Data de início da viagem (YYYY-MM-DD) — libera o boleto com 60+ dias. */
  startDate?: string | null;
  boletoMax?: number;
  boletoNote?: string | null;
  pixDiscountPercent?: number;
}): PaymentConfiguration {
  const { type, total, airline } = params;
  const pixPercent = params.pixDiscountPercent ?? PIX_DISCOUNT_PERCENT;
  const pixTotal = round2(total * (1 - pixPercent / 100));
  const dias = diasAteViagem(params.startDate);
  const boletoEnabled = type === "TRIP_PACKAGE" && dias != null && dias >= BOLETO_MIN_DAYS;

  return {
    methods: boletoEnabled ? ["CARD", "BOLETO", "PIX"] : ["CARD", "PIX"],
    card: {
      enabled: true,
      brands: CARD_BRANDS,
      installments: cardInstallments(total, airline),
    },
    boleto: {
      enabled: boletoEnabled,
      installments: boletoEnabled
        ? boletoInstallments(total, params.boletoMax ?? BOLETO_MAX_INSTALLMENTS)
        : [],
      note: boletoEnabled
        ? (params.boletoNote ??
          "Disponível para viagens com no mínimo 60 dias de antecedência, mediante aprovação.")
        : null,
    },
    pix: { enabled: true, discountPercent: pixPercent, total: pixTotal },
  };
}


export function brl(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

/** Melhor chamada de parcelamento (ex.: "10x de R$ 412,90 sem juros"). */
export function bestInstallmentLabel(installments: Installment[]): string | null {
  const best = [...installments].sort((a, b) => b.number - a.number)[0];
  if (!best || best.number <= 1) return null;
  return `${best.number}x de ${brl(best.amount)} sem juros`;
}
