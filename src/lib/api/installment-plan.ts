/**
 * Tabela de parcelamento por OFERTA (etapa de busca) — cálculo puro.
 * Regras VIA AIR: sem juros até o teto da companhia; acima disso, markup
 * cadastrado (`airfare_installment_markups`). Client-safe.
 */
import { airlineRule, isPixOnly } from "@/lib/airline-installments";
import { allowedInstallments, DEFAULT_EXTENDED_MARKUPS, type MarkupTable } from "@/lib/airfare-conditions";

export const MAX_INSTALLMENTS_PLAN = 12;

export type ApiInstallmentOption = {
  installments: number;
  installmentValue: number;
  total: number;
  /** Percentual aplicado acima do valor da tarifa (0 quando sem juros). */
  markupPercent: number;
  interestFree: boolean;
};

export type ApiInstallmentPlan = {
  /** Sempre "VIAAIR_RULES": simulação comercial da VIA AIR. */
  source: "VIAAIR_RULES";
  /** true = simulação; o valor definitivo do cartão vem no checkout. */
  estimated: true;
  currency: "BRL";
  baseAmount: number;
  maxInterestFree: number;
  maxInstallments: number;
  pixOnly: boolean;
  options: ApiInstallmentOption[];
};

export function montarPlanoDeParcelamento(args: {
  total: number;
  airline?: string | null;
  international?: boolean;
  markups?: MarkupTable;
}): ApiInstallmentPlan | null {
  const total = Number(args.total);
  if (!Number.isFinite(total) || total <= 0) return null;
  const markups = args.markups ?? DEFAULT_EXTENDED_MARKUPS;
  const regra = airlineRule(args.airline ?? null, { international: args.international });
  const pixOnly = isPixOnly(regra);
  const semJuros = pixOnly ? [1] : allowedInstallments(regra).filter((n) => n <= MAX_INSTALLMENTS_PLAN);
  const tetoSemJuros = Math.max(1, ...semJuros);

  const opcoes: ApiInstallmentOption[] = [];
  for (let n = 1; n <= MAX_INSTALLMENTS_PLAN; n++) {
    if (n === 1 || semJuros.includes(n)) {
      opcoes.push({
        installments: n,
        installmentValue: arred(total / n),
        total: arred(total),
        markupPercent: 0,
        interestFree: true,
      });
      continue;
    }
    if (pixOnly || n <= tetoSemJuros) continue;
    const markup = markups[n];
    if (!Number.isFinite(markup)) continue;
    const comMarkup = total * (1 + Number(markup) / 100);
    opcoes.push({
      installments: n,
      installmentValue: arred(comMarkup / n),
      total: arred(comMarkup),
      markupPercent: Number(markup),
      interestFree: false,
    });
  }

  return {
    source: "VIAAIR_RULES",
    estimated: true,
    currency: "BRL",
    baseAmount: arred(total),
    maxInterestFree: tetoSemJuros,
    maxInstallments: opcoes.length ? opcoes[opcoes.length - 1]!.installments : 1,
    pixOnly,
    options: opcoes,
  };
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}
