/**
 * FONTE ÚNICA DE VERDADE das condições comerciais do aéreo.
 *
 * Consumido por: motor de busca (Voos selecionados), Promoções de Aéreo,
 * card Feed, card Story, WhatsApp e Instagram.
 *
 * A regra sem juros vem SEMPRE da tabela oficial em `airline-installments.ts`
 * (teto por companhia + parcela mínima). Nada é hardcodado aqui nem nos cards.
 *
 * O parcelamento estendido ("Precisa de mais parcelas?") NÃO é calculado —
 * ele só existe quando o checkout/operadora devolve os valores reais de cada
 * quantidade. Sem esses valores, `extended.available` é false e a UI não deve
 * inventar `total / 12`.
 */
import { airlineRule, isPixOnly, type AirlineRule } from "./airline-installments";

/** Cotação padrão para converter parcela mínima em USD. */
export const DEFAULT_USD_BRL = 5.5;

/** Opção real de parcelamento devolvida pelo checkout. */
export type ExtendedOption = {
  installments: number;
  /** valor real da parcela informado pelo checkout */
  installmentValue: number;
  /** total resultante, quando informado */
  total?: number | null;
};

export type AirlineRef = { iata?: string | null; name?: string | null };

export type AirfareConditionsInput = {
  /** valor total da compra (todos os passageiros) */
  total: number;
  /** quantidade de passageiros usada na pesquisa */
  passengers?: number;
  airline?: AirlineRef | string | null;
  /** opções reais de maior parcelamento devolvidas pelo checkout */
  extendedOptions?: ExtendedOption[] | null;
  /** cotação usada no momento da consulta (para parcela mínima em USD) */
  usdBrl?: number;
};

export type AirfareConditions = {
  total: number;
  pricePerPassenger: number;
  passengers: number;
  interestFree: {
    available: boolean;
    installments: number;
    installmentValue: number;
    /** quantidades permitidas pela companhia (ex.: Emirates 3/5/9) */
    allowed: number[];
    /** label pronto: "6x de R$ 338,14 sem juros" ou "Somente Pix" */
    label: string;
  };
  extended: {
    available: boolean;
    maxInstallments: number | null;
    installmentValue: number | null;
    availableOptions: ExtendedOption[];
  };
  payment: {
    upToThreeCards: boolean;
    pixOnly: boolean;
  };
  airlineRule: AirlineRule;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function airlineKey(airline?: AirlineRef | string | null): string {
  if (!airline) return "";
  if (typeof airline === "string") return airline;
  return airline.name || airline.iata || "";
}

function minInBRL(rule: AirlineRule, usdBrl: number): number {
  if (rule.min == null) return 0;
  return rule.currency === "USD" ? rule.min * usdBrl : rule.min;
}

/** Quantidades permitidas pela companhia (respeita `only`). */
export function allowedInstallments(rule: AirlineRule): number[] {
  if (isPixOnly(rule)) return [1];
  return rule.only ?? Array.from({ length: Math.max(1, rule.max) }, (_, i) => i + 1);
}

/**
 * Melhor condição SEM JUROS: maior quantidade permitida cuja parcela ainda
 * respeita a parcela mínima da companhia. Se nenhuma respeitar, cai para 1x.
 */
export function bestInterestFree(
  total: number,
  rule: AirlineRule,
  usdBrl = DEFAULT_USD_BRL,
): { installments: number; installmentValue: number } {
  if (isPixOnly(rule) || total <= 0) return { installments: 1, installmentValue: total };
  const min = minInBRL(rule, usdBrl);
  const opcoes = allowedInstallments(rule).sort((a, b) => b - a);
  for (const n of opcoes) {
    if (n <= 1) break;
    if (min <= 0 || total / n >= min) return { installments: n, installmentValue: total / n };
  }
  return { installments: 1, installmentValue: total };
}

export function getAirfarePaymentConditions(input: AirfareConditionsInput): AirfareConditions {
  const total = Number.isFinite(input.total) ? Math.max(0, input.total) : 0;
  const passengers = Math.max(1, Math.trunc(input.passengers || 1));
  const usdBrl = input.usdBrl && input.usdBrl > 0 ? input.usdBrl : DEFAULT_USD_BRL;
  const rule = airlineRule(airlineKey(input.airline));
  const pixOnly = isPixOnly(rule);

  const best = bestInterestFree(total, rule, usdBrl);
  const allowed = allowedInstallments(rule);

  const label = pixOnly
    ? "Somente Pix"
    : best.installments <= 1
      ? `à vista ${brl(total)}`
      : `${best.installments}x de ${brl(best.installmentValue)} sem juros`;

  // Só usamos valores REAIS do checkout — nunca total ÷ n.
  const opts = (input.extendedOptions ?? [])
    .filter((o) => o && o.installments > best.installments && o.installmentValue > 0)
    .sort((a, b) => a.installments - b.installments);
  const top = opts.length ? opts[opts.length - 1]! : null;

  return {
    total,
    pricePerPassenger: total / passengers,
    passengers,
    interestFree: {
      available: !pixOnly && best.installments > 1,
      installments: best.installments,
      installmentValue: best.installmentValue,
      allowed,
      label,
    },
    extended: {
      available: !pixOnly && !!top,
      maxInstallments: top?.installments ?? null,
      installmentValue: top?.installmentValue ?? null,
      availableOptions: opts,
    },
    payment: { upToThreeCards: !pixOnly, pixOnly },
    airlineRule: rule,
  };
}

/** Texto curto reaproveitável em cards/WhatsApp. */
export function interestFreeText(c: AirfareConditions): string {
  if (c.payment.pixOnly) return "Somente Pix";
  if (!c.interestFree.available) return `à vista ${brl(c.total)}`;
  return `${c.interestFree.installments}x de ${brl(c.interestFree.installmentValue)} sem juros`;
}

export function extendedText(c: AirfareConditions): string | null {
  if (!c.extended.available || !c.extended.maxInstallments || !c.extended.installmentValue) return null;
  return `${c.extended.maxInstallments}x de ${brl(c.extended.installmentValue)}`;
}

export const AVISO_MAIOR_PARCELAMENTO =
  "Nas opções de maior parcelamento, quanto menos parcelas, mais barato você paga.";

export const AVISO_VALIDADE_TARIFA =
  "Valor válido para compra hoje • sujeito à disponibilidade e atualização tarifária";

/* ── Parcelamento estendido com markup ──────────────────────────────────
   O checkout não expõe as parcelas via API, então o acréscimo de cada
   modalidade vem da tabela `airfare_installment_markups` (editável no
   Command Center). NUNCA usar total ÷ n. */

/** Markup por quantidade de parcelas, em PERCENTUAL (ex.: 6.08 = 6,08%). */
export type MarkupTable = Record<number, number>;

/** Tabela inicial validada no checkout (fallback quando o banco não responde). */
export const DEFAULT_EXTENDED_MARKUPS: MarkupTable = {
  5: 6.08,
  6: 7.12,
  7: 8.16,
  8: 9.21,
  9: 10.26,
  10: 11.33,
  11: 12.39,
  12: 19.98,
};

export type ExtendedInstallmentQuote = {
  installments: number;
  markupPercent: number;
  total: number;
  installmentValue: number;
};

/**
 * Valores reais de cada modalidade de maior parcelamento:
 * total = original × (1 + markup) ; parcela = total ÷ parcelas.
 */
export function buildExtendedQuotes(
  original: number,
  markups: MarkupTable = DEFAULT_EXTENDED_MARKUPS,
  minInstallments = 2,
): ExtendedInstallmentQuote[] {
  if (!Number.isFinite(original) || original <= 0) return [];
  return Object.entries(markups)
    .map(([k, percent]) => ({ n: Number(k), percent: Number(percent) }))
    .filter((o) => Number.isFinite(o.n) && o.n > minInstallments && Number.isFinite(o.percent))
    .sort((a, b) => a.n - b.n)
    .map(({ n, percent }) => {
      const total = original * (1 + percent / 100);
      return {
        installments: n,
        markupPercent: percent,
        total,
        installmentValue: total / n,
      };
    });
}

/** Converte as cotações com markup no formato aceito por `getAirfarePaymentConditions`. */
export function quotesToExtendedOptions(quotes: ExtendedInstallmentQuote[]): ExtendedOption[] {
  return quotes.map((q) => ({
    installments: q.installments,
    installmentValue: q.installmentValue,
    total: q.total,
  }));
}

/**
 * Texto do maior parcelamento (padrão 12x) já com o markup aplicado.
 * Ex.: "ou 12x de R$ 1.234,56".
 */
export function maxInstallmentText(
  total: number,
  installments = 12,
  markups: MarkupTable = DEFAULT_EXTENDED_MARKUPS,
): string | null {
  const q = buildExtendedQuotes(total, markups).find((x) => x.installments === installments);
  if (!q) return null;
  return `ou ${q.installments}x de ${brl(q.installmentValue)}`;
}

