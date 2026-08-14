/**
 * Montagem das formas de pagamento exibidas no orçamento público.
 *
 * AIR_ONLY  -> Cartão | Pix              (NUNCA boleto)
 * TRIP_PACKAGE -> Cartão | Boleto | Pix
 *
 * As parcelas de cartão seguem exatamente as regras por companhia aérea
 * já usadas no Comprar Viagem (src/lib/airline-installments.ts).
 */
import { bestInstallments } from "@/lib/airline-installments";
import type { Installment, PaymentConfiguration, QuoteType } from "./types";

/** Desconto padrão do Pix (mesma regra comercial da VIA AIR). */
export const PIX_DISCOUNT_PERCENT = 5;

const CARD_BRANDS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lista de parcelas sem juros de 1x até o máximo permitido pela cia. */
export function cardInstallments(total: number, airline?: string | null): Installment[] {
  const max = bestInstallments(total, airline).parcelas;
  const out: Installment[] = [];
  for (let n = 1; n <= max; n++) {
    out.push({ number: n, amount: round2(total / n), total: round2(total), interestFree: true });
  }
  return out;
}

/** Parcelas de boleto (pacotes): entrada + demais, sem juros. */
export function boletoInstallments(total: number, max = 10): Installment[] {
  const out: Installment[] = [];
  for (let n = 1; n <= max; n++) {
    const amount = total / n;
    if (n > 1 && amount < 100) break;
    out.push({ number: n, amount: round2(amount), total: round2(total), interestFree: true });
  }
  return out;
}

export function buildPayment(params: {
  type: QuoteType;
  total: number;
  airline?: string | null;
  boletoMax?: number;
  boletoNote?: string | null;
  pixDiscountPercent?: number;
}): PaymentConfiguration {
  const { type, total, airline } = params;
  const pixPercent = params.pixDiscountPercent ?? PIX_DISCOUNT_PERCENT;
  const pixTotal = round2(total * (1 - pixPercent / 100));
  const boletoEnabled = type === "TRIP_PACKAGE";

  return {
    methods: boletoEnabled ? ["CARD", "BOLETO", "PIX"] : ["CARD", "PIX"],
    card: {
      enabled: true,
      brands: CARD_BRANDS,
      installments: cardInstallments(total, airline),
    },
    boleto: {
      enabled: boletoEnabled,
      installments: boletoEnabled ? boletoInstallments(total, params.boletoMax ?? 10) : [],
      note: boletoEnabled ? (params.boletoNote ?? null) : null,
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
