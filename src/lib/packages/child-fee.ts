/**
 * Detecta em textos de passeios a regra "criança paga só uma taxinha simbólica"
 * (ex.: "crianças de 3 a 9 anos pagam US$ 1 no local").
 * Quando existe, a criança NÃO entra no valor do passeio — só paga a taxa no local.
 */
export type ChildTokenFee = {
  minAge: number | null;
  maxAge: number | null;
  amount: number;
  currency: string; // "US$", "R$", "€"
};

const CURRENCY: Record<string, string> = {
  us$: "US$",
  usd: "US$",
  "$": "US$",
  "r$": "R$",
  brl: "R$",
  "€": "€",
  eur: "€",
};

/** Valor considerado simbólico (taxa de reserva paga no local). */
const MAX_TOKEN_AMOUNT = 5;

export function detectChildTokenFee(...texts: (string | null | undefined)[]): ChildTokenFee | null {
  const raw = texts.filter(Boolean).join("\n");
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/\s+/g, " ");
  if (!/(crian|child|infantil|menor)/.test(text)) return null;

  // faixa etária: "de 3 a 9 anos" / "3-9 anos" / "entre 3 e 9 anos"
  const ageMatch = text.match(
    /(?:de|entre|dos)?\s*(\d{1,2})\s*(?:a|à|-|até|e)\s*(\d{1,2})\s*anos/,
  );

  // valor simbólico: "us$ 1", "$1,00", "r$ 1"
  const valueRe = /(us\$|usd|r\$|brl|€|eur|\$)\s*(\d{1,3}(?:[.,]\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = valueRe.exec(text))) {
    const amount = Number(m[2].replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TOKEN_AMOUNT) continue;
    // precisa estar no mesmo contexto de criança
    const around = text.slice(Math.max(0, m.index - 120), m.index + 120);
    if (!/(crian|child|infantil|menor)/.test(around)) continue;
    return {
      minAge: ageMatch ? Number(ageMatch[1]) : null,
      maxAge: ageMatch ? Number(ageMatch[2]) : null,
      amount,
      currency: CURRENCY[m[1]] ?? m[1].toUpperCase(),
    };
  }
  return null;
}

export function formatChildTokenFee(fee: ChildTokenFee) {
  const faixa =
    fee.minAge != null && fee.maxAge != null
      ? `Crianças de ${fee.minAge} a ${fee.maxAge} anos`
      : "Crianças";
  const valor = `${fee.currency} ${fee.amount.toFixed(2).replace(".", ",")}`;
  const abaixo = fee.minAge != null ? ` Menores de ${fee.minAge} anos são gratuitos.` : "";
  const acima =
    fee.maxAge != null
      ? ` A partir de ${fee.maxAge + 1} anos paga valor de adulto.`
      : "";
  return `${faixa}: pagam apenas a taxa de ${valor} por criança, em dinheiro, no local do embarque.${abaixo}${acima}`;

}


/** Política de idades configurada manualmente no cadastro do passeio. */
export type AgePolicy = {
  /** Até esta idade (inclusive) a criança é gratuita. */
  freeMaxAge: number | null;
  /** Faixa que paga apenas a taxa simbólica no local. */
  feeMinAge: number | null;
  feeMaxAge: number | null;
  feeAmount: number | null;
  feeCurrency: string;
  /** A partir desta idade paga valor de adulto. */
  adultMinAge: number | null;
};

export function parseAgePolicy(services: any): AgePolicy | null {
  const p = services?.age_policy;
  if (!p || typeof p !== "object") return null;
  const num = (v: any) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const policy: AgePolicy = {
    freeMaxAge: num(p.free_max_age),
    feeMinAge: num(p.fee_min_age),
    feeMaxAge: num(p.fee_max_age),
    feeAmount: num(p.fee_amount),
    feeCurrency: p.fee_currency || "US$",
    adultMinAge: num(p.adult_min_age),
  };
  const hasAny =
    policy.freeMaxAge != null ||
    policy.feeMinAge != null ||
    policy.feeMaxAge != null ||
    policy.adultMinAge != null;
  return hasAny ? policy : null;
}

/** Política derivada do texto (fallback) quando não há cadastro manual. */
export function agePolicyFromText(fee: ChildTokenFee | null): AgePolicy | null {
  if (!fee) return null;
  return {
    freeMaxAge: fee.minAge != null ? fee.minAge - 1 : null,
    feeMinAge: fee.minAge,
    feeMaxAge: fee.maxAge,
    feeAmount: fee.amount,
    feeCurrency: fee.currency,
    adultMinAge: fee.maxAge != null ? fee.maxAge + 1 : null,
  };
}

/**
 * Política padrão quando o passeio não informa nada: bebês até 2 anos
 * são gratuitos e a partir de 3 anos paga valor de adulto.
 */
export const DEFAULT_AGE_POLICY: AgePolicy = {
  freeMaxAge: 2,
  feeMinAge: null,
  feeMaxAge: null,
  feeAmount: null,
  feeCurrency: "US$",
  adultMinAge: 3,
};

/**
 * Resolve a política na ordem: cadastro manual → detecção pelo texto → padrão.
 * Se a política encontrada não define a gratuidade, completa com até 2 anos.
 */
export function resolveAgePolicy(
  services: any,
  ...texts: (string | null | undefined)[]
): AgePolicy {
  const found = parseAgePolicy(services) ?? agePolicyFromText(detectChildTokenFee(...texts));
  if (!found) return DEFAULT_AGE_POLICY;
  return {
    ...found,
    freeMaxAge: found.freeMaxAge ?? DEFAULT_AGE_POLICY.freeMaxAge,
  };
}

export type ChildClassification = "free" | "token" | "adult";

export function classifyChild(age: number, p: AgePolicy): ChildClassification {
  if (p.freeMaxAge != null && age <= p.freeMaxAge) return "free";
  if (p.feeMinAge != null && p.feeMaxAge != null && age >= p.feeMinAge && age <= p.feeMaxAge)
    return "token";
  if (p.adultMinAge != null && age >= p.adultMinAge) return "adult";
  if (p.feeMaxAge != null && age > p.feeMaxAge) return "adult";
  return "adult";
}

export function formatAgePolicy(p: AgePolicy) {
  const parts: string[] = [];
  if (p.freeMaxAge != null) parts.push(`Crianças até ${p.freeMaxAge} anos: gratuito.`);
  if (p.feeMinAge != null && p.feeMaxAge != null && p.feeAmount != null)
    parts.push(
      `Crianças de ${p.feeMinAge} a ${p.feeMaxAge} anos: pagam apenas ${p.feeCurrency} ${p.feeAmount
        .toFixed(2)
        .replace(".", ",")} por criança, em dinheiro, no local do embarque.`,
    );
  if (p.adultMinAge != null) parts.push(`A partir de ${p.adultMinAge} anos: paga valor de adulto.`);
  return parts.join(" ");
}
