/**
 * Montagem das formas de pagamento exibidas no orçamento público.
 *
 * Regras comerciais VIA AIR (fixas):
 * - Cartão: SEMPRE até 10x sem juros.
 * - Boleto: 10x sem juros, apenas quando a viagem tem antecedência mínima
 *   de 60 dias (e o orçamento é pacote).
 * - Pix: SEMPRE aceito em todos os orçamentos. O desconto de 5% é válido
 *   APENAS para pacotes (TRIP_PACKAGE). Somente aéreo (AIR_ONLY) não tem
 *   desconto no Pix.
 */
import type { Installment, PaymentConfiguration, QuoteType } from "./types";
import { bestInstallments } from "@/lib/airline-installments";
import { DEFAULT_EXTENDED_MARKUPS, buildExtendedQuotes, type MarkupTable } from "@/lib/airfare-conditions";

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

/**
 * Parcelas de cartão.
 * - Pacote (TRIP_PACKAGE): sempre 1x..10x sem juros.
 * - Somente aéreo (AIR_ONLY): teto sem juros da companhia + parcelas com
 *   markup do financeiro (até 12x).
 */
export function cardInstallments(
  total: number,
  airline?: string | null,
  type: QuoteType = "TRIP_PACKAGE",
  markups: MarkupTable = DEFAULT_EXTENDED_MARKUPS,
): Installment[] {
  if (type === "AIR_ONLY") return airCardInstallments(total, airline, markups);
  const out: Installment[] = [];
  for (let n = 1; n <= CARD_MAX_INSTALLMENTS; n++) {
    out.push({ number: n, amount: round2(total / n), total: round2(total), interestFree: true });
  }
  return out;
}

/** Aéreo: X vezes sem juros da cia + demais com markup oficial (até 12x). */
export function airCardInstallments(
  total: number,
  airline?: string | null,
  markups: MarkupTable = DEFAULT_EXTENDED_MARKUPS,
): Installment[] {
  const { parcelas } = bestInstallments(total, airline);
  const maxSemJuros = Math.max(1, parcelas);
  const out: Installment[] = [];
  for (let n = 1; n <= maxSemJuros; n++) {
    out.push({ number: n, amount: round2(total / n), total: round2(total), interestFree: true });
  }
  for (const q of buildExtendedQuotes(total, markups)) {
    if (q.installments <= maxSemJuros || q.installments > 12) continue;
    out.push({
      number: q.installments,
      amount: round2(q.installmentValue),
      total: round2(q.total),
      interestFree: false,
    });
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

/** Dias mínimos entre a quitação e a viagem no boleto "até a data da viagem". */
export const BOLETO_QUITACAO_DIAS_ANTES = 30;

function isoMenosDias(startDate: string, dias: number): string | null {
  const m = String(startDate).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Boleto "até a data da viagem": a antecedência define o número de parcelas
 * mensais. A entrada é sempre o valor de UMA parcela (paga na contratação) e
 * a última parcela vence 30 dias antes do embarque.
 */
export function boletoAteViagem(total: number, startDate?: string | null) {
  const dias = diasAteViagem(startDate);
  if (!startDate || dias == null || total <= 0) return null;
  // Antecedência mínima de 60 dias, igual ao boleto financiado.
  if (dias < BOLETO_MIN_DAYS) return null;
  const prazo = dias - BOLETO_QUITACAO_DIAS_ANTES;
  if (prazo < 30) return null;
  const parcelas = Math.max(2, Math.min(BOLETO_MAX_INSTALLMENTS, Math.floor(prazo / 30) + 1));
  const parcela = round2(total / parcelas);
  return {
    enabled: true,
    installments: parcelas,
    entrada: parcela,
    parcela,
    total: round2(total),
    lastDueDate: isoMenosDias(startDate, BOLETO_QUITACAO_DIAS_ANTES),
    note: `Entrada de ${brl(parcela)} na contratação e mais ${parcelas - 1}x de ${brl(parcela)}, com quitação total até 30 dias antes da viagem.`,
  };
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
  /** Tabela de markup do financeiro (parcelamento estendido do aéreo). */
  markups?: MarkupTable;
}): PaymentConfiguration {
  const { type, total, airline } = params;
  // Regra comercial VIA AIR: Pix sempre aceito. Desconto de 5% somente em
  // pacotes (TRIP_PACKAGE). Somente aéreo (AIR_ONLY) não tem desconto no Pix.
  const pixPercent = type === "AIR_ONLY" ? 0 : (params.pixDiscountPercent ?? PIX_DISCOUNT_PERCENT);
  const pixTotal = round2(total * (1 - pixPercent / 100));
  const dias = diasAteViagem(params.startDate);
  // Boleto 10x financiado: exclusivo de pacote com 60+ dias de antecedência.
  const boletoFinanciado = type === "TRIP_PACKAGE" && dias != null && dias >= BOLETO_MIN_DAYS;
  // Boleto até a data da viagem: vale sempre que houver 60+ dias (30 de prazo
  // de parcelamento + 30 dias de quitação antes do embarque).
  const ateViagem = boletoAteViagem(total, params.startDate);
  const boletoEnabled = boletoFinanciado || !!ateViagem;

  return {
    methods: boletoEnabled ? ["CARD", "BOLETO", "PIX"] : ["CARD", "PIX"],
    card: {
      enabled: true,
      brands: CARD_BRANDS,
      installments: cardInstallments(total, airline, type, params.markups),
    },
    boleto: {
      enabled: boletoEnabled,
      installments: boletoFinanciado
        ? boletoInstallments(total, params.boletoMax ?? BOLETO_MAX_INSTALLMENTS)
        : [],
      note: boletoFinanciado ? (params.boletoNote ?? null) : null,
      untilTravel: ateViagem,
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
