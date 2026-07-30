/**
 * Parcelamento máximo no cartão por companhia aérea (regra da operadora).
 * O portal mostra "até 12x" genérico, mas o parcelamento real obedece a cia.
 */
const RULES: Array<{ match: RegExp; max: number }> = [
  { match: /latam|tam\b/i, max: 4 },
  { match: /\bgol\b/i, max: 5 },
  { match: /azul/i, max: 5 },
];

const IATA: Record<string, number> = { LA: 4, JJ: 4, G3: 5, AD: 5 };

export function maxInstallments(airline?: { iata?: string; name?: string } | null): number {
  const iata = (airline?.iata ?? "").toUpperCase();
  if (IATA[iata]) return IATA[iata];
  const name = airline?.name ?? "";
  for (const r of RULES) if (r.match.test(name)) return r.max;
  return 4; // fallback conservador para cias sem regra específica
}

export function installmentLabel(total: number, airline?: { iata?: string; name?: string } | null) {
  const n = maxInstallments(airline);
  const value = total / n;
  return `${n}x de ${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} sem juros`;
}
