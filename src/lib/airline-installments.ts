/**
 * Regras de parcelamento por companhia aérea (flyer VIA AIR "Formas de pagamento").
 * Guarda o máximo de parcelas SEM JUROS e a PARCELA MÍNIMA de cada cia.
 * A quantidade real de parcelas é sempre limitada pela parcela mínima.
 */

export type AirlineRule = {
  /** máximo de parcelas sem juros */
  max: number;
  /** parcela mínima; null = não há */
  min: number | null;
  /** moeda da parcela mínima */
  currency?: "BRL" | "USD";
  /** só permite exatamente esses números de parcela (ex.: Emirates 3/5/9) */
  only?: number[];
  obs?: string;
};

/** Câmbio aproximado só pra converter parcela mínima em USD. */
const USD_BRL = 5.5;

/** chave = regex sobre o nome/IATA da cia */
const RULES: Array<{ name: string; iata: string; match: RegExp; rule: AirlineRule }> = [
  // Nacionais
  { name: "LATAM Airlines", iata: "LA", match: /latam|\btam\b|^(LA|JJ)$/i, rule: { max: 4, min: 70 } },
  { name: "GOL Linhas Aéreas", iata: "G3", match: /\bgol\b|^G3$/i, rule: { max: 5, min: 100 } },
  { name: "Azul Linhas Aéreas", iata: "AD", match: /azul|^AD$/i, rule: { max: 5, min: 120 } },
  // Internacionais
  { name: "Aerolíneas Argentinas", iata: "AR", match: /aerol[ií]neas|^AR$/i, rule: { max: 12, min: 80, currency: "USD" } },
  { name: "Aeroméxico", iata: "AM", match: /aerom[eé]xico|^AM$/i, rule: { max: 12, min: 80 } },
  { name: "Air Canada", iata: "AC", match: /air canada|^AC$/i, rule: { max: 6, min: 30, currency: "USD" } },
  { name: "Air China", iata: "CA", match: /air china|^CA$/i, rule: { max: 5, min: 50, currency: "USD" } },
  { name: "Air Europa", iata: "UX", match: /air europa|^UX$/i, rule: { max: 10, min: null } },
  { name: "Air France", iata: "AF", match: /air france|^AF$/i, rule: { max: 4, min: null } },
  { name: "ANA - All Nippon Airways", iata: "NH", match: /nippon|\bana\b|^NH$/i, rule: { max: 5, min: 150, currency: "USD" } },
  { name: "Avianca", iata: "AV", match: /avianca|^AV$/i, rule: { max: 10, min: 100 } },
  { name: "Boliviana de Aviación", iata: "OB", match: /boliviana|^OB$/i, rule: { max: 6, min: 150, currency: "USD" } },
  { name: "British Airways", iata: "BA", match: /british|^BA$/i, rule: { max: 10, min: null } },
  { name: "Cathay Pacific", iata: "CX", match: /cathay|^CX$/i, rule: { max: 1, min: null, obs: "somente faturado" } },
  { name: "Copa Airlines", iata: "CM", match: /copa|^CM$/i, rule: { max: 6, min: null } },
  { name: "Delta Air Lines", iata: "DL", match: /delta|^DL$/i, rule: { max: 6, min: null } },
  { name: "El Al", iata: "LY", match: /el al|^LY$/i, rule: { max: 3, min: null } },
  { name: "Emirates", iata: "EK", match: /emirates|^EK$/i, rule: { max: 9, min: null, only: [3, 5, 9] } },
  { name: "Ethiopian Airlines", iata: "ET", match: /ethiopian|^ET$/i, rule: { max: 6, min: 200 } },
  { name: "Iberia", iata: "IB", match: /iberia|^IB$/i, rule: { max: 10, min: null } },
  { name: "ITA Airways", iata: "AZ", match: /ita airways|^AZ$/i, rule: { max: 6, min: 100 } },
  { name: "Japan Airlines", iata: "JL", match: /japan airlines|\bjal\b|^JL$/i, rule: { max: 1, min: null, obs: "somente à vista" } },
  { name: "JetSMART", iata: "JA", match: /jetsmart|^JA$/i, rule: { max: 6, min: null, only: [6] } },
  { name: "KLM", iata: "KL", match: /\bklm\b|^KL$/i, rule: { max: 4, min: 200 } },
  { name: "Korean Air", iata: "KE", match: /korean|^KE$/i, rule: { max: 1, min: null, obs: "somente à vista" } },
  { name: "Lufthansa", iata: "LH", match: /lufthansa|^LH$/i, rule: { max: 5, min: null } },
  { name: "Qatar Airways", iata: "QR", match: /qatar|^QR$/i, rule: { max: 5, min: null } },
  { name: "Royal Air Maroc", iata: "AT", match: /royal air maroc|^AT$/i, rule: { max: 10, min: null, only: [10] } },
  { name: "Singapore Airlines", iata: "SQ", match: /singapore|^SQ$/i, rule: { max: 5, min: 100 } },
  { name: "Sky Airline", iata: "H2", match: /\bsky\b|^H2$/i, rule: { max: 3, min: 60 } },
  { name: "South African Airways", iata: "SA", match: /south african|^SA$/i, rule: { max: 6, min: 70 } },
  { name: "Swiss", iata: "LX", match: /swiss|^LX$/i, rule: { max: 5, min: null } },
  { name: "TAAG Angola", iata: "DT", match: /taag|^DT$/i, rule: { max: 4, min: null } },
  { name: "TAP Air Portugal", iata: "TP", match: /\btap\b|^TP$/i, rule: { max: 10, min: null, only: [10] } },
  { name: "Turkish Airlines", iata: "TK", match: /turkish|^TK$/i, rule: { max: 5, min: null, only: [5] } },
  { name: "United Airlines", iata: "UA", match: /united|^UA$/i, rule: { max: 5, min: 50, currency: "USD" } },
  { name: "American Airlines", iata: "AA", match: /american airlines|^AA$/i, rule: { max: 6, min: null } },
  { name: "Qantas", iata: "QF", match: /qantas|^QF$/i, rule: { max: 4, min: null } },
];

/** Tabela pronta para exibição pública (ordenada: nacionais primeiro). */
export const AIRLINE_INSTALLMENT_TABLE: Array<{
  name: string;
  iata: string;
  rule: AirlineRule;
}> = RULES.map(({ name, iata, rule }) => ({ name, iata, rule }));

/** Texto curto do parcelamento de uma cia (ex.: "até 5x sem juros"). */
export function ruleInstallmentsLabel(rule: AirlineRule): string {
  if (isPixOnly(rule)) return "Somente Pix";
  if (rule.obs) return rule.obs.charAt(0).toUpperCase() + rule.obs.slice(1);
  if (rule.only) return `${rule.only.join("x, ")}x sem juros`;
  if (rule.max <= 1) return "À vista";
  return `Até ${rule.max}x sem juros`;
}

/** Companhias que não parcelam (faturado/à vista) — pagamento via Pix. */
export function isPixOnly(rule: AirlineRule): boolean {
  const obs = (rule.obs ?? "").toLowerCase();
  return obs.includes("faturado") || obs.includes("à vista") || obs.includes("a vista");
}

/** Texto da parcela mínima (ex.: "R$ 70,00" ou "USD 80"). */
export function ruleMinLabel(rule: AirlineRule): string {
  if (isPixOnly(rule)) return "Sem parcela mínima";
  if (rule.min == null) return "Sem parcela mínima";
  return rule.currency === "USD"
    ? `USD ${rule.min}`
    : rule.min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


const FALLBACK: AirlineRule = { max: 4, min: 100 };

export function airlineRule(airline?: string | null): AirlineRule {
  const s = (airline ?? "").trim();
  if (!s) return FALLBACK;
  for (const r of RULES) if (r.match.test(s)) return r.rule;
  return FALLBACK;
}

/** Parcela mínima em reais (converte USD por aproximação). */
function minBRL(rule: AirlineRule): number {
  if (rule.min == null) return 0;
  return rule.currency === "USD" ? rule.min * USD_BRL : rule.min;
}

/**
 * Melhor parcelamento sem juros para um total, respeitando teto da cia,
 * parcelas permitidas e parcela mínima.
 */
export function bestInstallments(
  total: number,
  airline?: string | null,
): { parcelas: number; valor: number } {
  const rule = airlineRule(airline);
  const min = minBRL(rule);
  const permitidas = rule.only ?? Array.from({ length: rule.max }, (_, i) => i + 1);
  const ordenadas = [...permitidas].sort((a, b) => b - a);
  for (const n of ordenadas) {
    if (n <= 1) break;
    if (min <= 0 || total / n >= min) return { parcelas: n, valor: total / n };
  }
  return { parcelas: 1, valor: total };
}

export function installmentLabelFor(total: number, airline?: string | null): string {
  const { parcelas, valor } = bestInstallments(total, airline);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return parcelas <= 1 ? `à vista ${brl(total)}` : `${parcelas}x de ${brl(valor)} sem juros`;
}
