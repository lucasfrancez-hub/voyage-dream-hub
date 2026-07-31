/**
 * Parcelamento por companhia aérea — delega para a tabela oficial em
 * `airline-installments.ts` (teto sem juros + parcela mínima de cada cia).
 */
import { airlineRule, bestInstallments } from "./airline-installments";

export function maxInstallments(airline?: { iata?: string; name?: string } | null): number {
  const key = airline?.name || airline?.iata || "";
  return airlineRule(key).max;
}

export function installmentLabel(total: number, airline?: { iata?: string; name?: string } | null) {
  const key = airline?.name || airline?.iata || "";
  const { parcelas, valor } = bestInstallments(total, key);
  const brl = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return parcelas <= 1 ? `à vista ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : `${parcelas}x de ${brl} sem juros`;
}
