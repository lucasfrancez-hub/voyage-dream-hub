/**
 * Limite de parcelas no cartão por bandeira.
 *
 * Regra comercial: em pacotes de origem Cativa (Cativa Operadora /
 * "Cativa / Viajando com Desconto" / Viajando com Desconto), as bandeiras
 * Hipercard, Diners, Elo e Amex só podem ser parceladas em até 6x sem juros.
 * Visa e Mastercard seguem o limite padrão do checkout.
 */
import { isCativaSource } from "./prepaid-boleto";

export const CATIVA_LIMITED_BRANDS = ["Hipercard", "Diners", "Elo", "Amex"] as const;
export const CATIVA_LIMITED_MAX_INSTALLMENTS = 6;

function isLimitedBrand(brand?: string | null): boolean {
  const b = String(brand ?? "").trim().toLowerCase();
  return CATIVA_LIMITED_BRANDS.some((x) => x.toLowerCase() === b);
}

/** Máximo de parcelas permitido para a bandeira escolhida. */
export function maxCardInstallments(input: {
  brand?: string | null;
  supplierName?: string | null;
  source?: string | null;
  defaultMax: number;
}): number {
  const { brand, supplierName, source, defaultMax } = input;
  if (isCativaSource(supplierName, source) && isLimitedBrand(brand)) {
    return Math.min(defaultMax, CATIVA_LIMITED_MAX_INSTALLMENTS);
  }
  return defaultMax;
}

/** Opções de parcelas (1..max) para o seletor do formulário de cartão. */
export function cardInstallmentOptions(max: number): number[] {
  return Array.from({ length: Math.max(1, max) }, (_, i) => i + 1);
}
