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

