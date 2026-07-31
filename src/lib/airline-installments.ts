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
const RULES: Array<{ match: RegExp; rule: AirlineRule }> = [
  // Nacionais
  { match: /latam|\btam\b|^(LA|JJ)$/i, rule: { max: 4, min: 70 } },
  { match: /\bgol\b|^G3$/i, rule: { max: 5, min: 100 } },
  { match: /azul|^AD$/i, rule: { max: 5, min: 120 } },
  // Internacionais
  { match: /aerol[ií]neas|^AR$/i, rule: { max: 12, min: 80, currency: "USD" } },
  { match: /aerom[eé]xico|^AM$/i, rule: { max: 12, min: 80 } },
  { match: /air canada|^AC$/i, rule: { max: 6, min: 30, currency: "USD" } },
  { match: /air china|^CA$/i, rule: { max: 5, min: 50, currency: "USD" } },
  { match: /air europa|^UX$/i, rule: { max: 10, min: null } },
  { match: /air france|^AF$/i, rule: { max: 4, min: null } },
  { match: /nippon|\bana\b|^NH$/i, rule: { max: 5, min: 150, currency: "USD" } },
  { match: /avianca|^AV$/i, rule: { max: 10, min: 100 } },
  { match: /boliviana|^OB$/i, rule: { max: 6, min: 150, currency: "USD" } },
  { match: /british|^BA$/i, rule: { max: 10, min: null } },
  { match: /cathay|^CX$/i, rule: { max: 1, min: null, obs: "somente faturado" } },
  { match: /copa|^CM$/i, rule: { max: 6, min: null } },
  { match: /delta|^DL$/i, rule: { max: 6, min: null } },
  { match: /el al|^LY$/i, rule: { max: 3, min: null } },
  { match: /emirates|^EK$/i, rule: { max: 9, min: null, only: [3, 5, 9] } },
  { match: /ethiopian|^ET$/i, rule: { max: 6, min: 200 } },
  { match: /iberia|^IB$/i, rule: { max: 10, min: null } },
  { match: /ita airways|^AZ$/i, rule: { max: 6, min: 100 } },
  { match: /japan airlines|\bjal\b|^JL$/i, rule: { max: 1, min: null, obs: "somente à vista" } },
  { match: /jetsmart|^JA$/i, rule: { max: 6, min: null, only: [6] } },
  { match: /\bklm\b|^KL$/i, rule: { max: 4, min: 200 } },
  { match: /korean|^KE$/i, rule: { max: 1, min: null, obs: "somente à vista" } },
  { match: /lufthansa|^LH$/i, rule: { max: 5, min: null } },
  { match: /qatar|^QR$/i, rule: { max: 5, min: null } },
  { match: /royal air maroc|^AT$/i, rule: { max: 10, min: null, only: [10] } },
  { match: /singapore|^SQ$/i, rule: { max: 5, min: 100 } },
  { match: /\bsky\b|^H2$/i, rule: { max: 3, min: 60 } },
  { match: /south african|^SA$/i, rule: { max: 6, min: 70 } },
  { match: /swiss|^LX$/i, rule: { max: 5, min: null } },
  { match: /taag|^DT$/i, rule: { max: 4, min: null } },
  { match: /\btap\b|^TP$/i, rule: { max: 10, min: null, only: [10] } },
  { match: /turkish|^TK$/i, rule: { max: 5, min: null, only: [5] } },
  { match: /united|^UA$/i, rule: { max: 5, min: 50, currency: "USD" } },
  { match: /american airlines|^AA$/i, rule: { max: 6, min: null } },
  { match: /qantas|^QF$/i, rule: { max: 4, min: null } },
];

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
