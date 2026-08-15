/**
 * Extração e interpretação de bagagem vinda de orçamentos de operadora.
 *
 * O Infotravel (e outras fontes) descreve bagagem de formas muito diferentes:
 *   - texto: "1x Bagagem despachada (23kg)"
 *   - objeto: { description: "..." }
 *   - lista: [{ quantity: 1, type: "CHECKED", weight: 23, unit: "KG" }]
 * Aqui varremos qualquer estrutura procurando chaves de bagagem e devolvemos
 * um texto normalizado + flags confiáveis.
 */

export type BaggageFlags = {
  checkedBaggage: boolean;
  carryOn: boolean;
  personalItem: boolean;
  checkedPieces: number | null;
  checkedWeightKg: number | null;
  text: string | null;
};

const BAG_KEY = /bagg?ag|bagagem|baggages|luggage/i;

function pushText(out: string[], v: string | null | undefined) {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  if (s && !out.includes(s)) out.push(s);
}

function describeEntry(entry: any): string | null {
  if (entry == null) return null;
  if (typeof entry === "string") return entry;
  if (typeof entry === "number") return entry > 0 ? `${entry}x bagagem despachada` : null;
  if (typeof entry === "boolean") return entry ? "Bagagem despachada" : null;
  if (typeof entry !== "object") return null;

  const direct =
    entry.description ?? entry.descricao ?? entry.text ?? entry.label ?? entry.name ?? entry.title ?? null;
  const parts: string[] = [];
  if (typeof direct === "string" && direct.trim()) parts.push(direct.trim());

  const qty = Number(entry.quantity ?? entry.pieces ?? entry.qty ?? entry.amount ?? entry.count);
  const weight = Number(entry.weight ?? entry.kilos ?? entry.kg ?? entry.weightValue);
  const type = String(entry.type ?? entry.category ?? entry.baggageType ?? "").toUpperCase();

  if (!parts.length) {
    const isChecked = /CHECK|DESPACH|HOLD|PORAO|PORÃO|BAG$/.test(type) || (!type && (qty > 0 || weight > 0));
    const isCarry = /CARRY|CABIN|MAO|MÃO|HAND/.test(type);
    const isPersonal = /PERSONAL|PESSOAL/.test(type);
    const label = isPersonal
      ? "Item pessoal"
      : isCarry
        ? "Bagagem de mão"
        : isChecked
          ? "Bagagem despachada"
          : null;
    if (label) {
      parts.push(`${Number.isFinite(qty) && qty > 0 ? `${qty}x ` : ""}${label}`);
      if (Number.isFinite(weight) && weight > 0) parts.push(`(${weight}kg)`);
    }
  } else if (Number.isFinite(weight) && weight > 0 && !/kg/i.test(parts[0]!)) {
    parts.push(`(${weight}kg)`);
  }

  return parts.length ? parts.join(" ") : null;
}

/** Varre recursivamente qualquer objeto procurando informação de bagagem. */
export function collectBaggageText(...sources: any[]): string | null {
  const out: string[] = [];

  const walkValue = (value: any, depth: number) => {
    if (value == null || depth > 4) return;
    if (Array.isArray(value)) {
      for (const v of value) pushText(out, describeEntry(v));
      return;
    }
    pushText(out, describeEntry(value));
  };

  const walk = (node: any, depth: number) => {
    if (node == null || typeof node !== "object" || depth > 5) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (BAG_KEY.test(key)) walkValue(value, depth);
      else if (value && typeof value === "object") walk(value, depth + 1);
    }
  };

  for (const src of sources) {
    if (typeof src === "string") pushText(out, src);
    else walk(src, 0);
  }

  return out.length ? out.join(" • ") : null;
}

export function parseBaggage(text: string | null | undefined): BaggageFlags {
  const t = (text ?? "").trim();
  const semBagagem = /sem\s+bagagem\s+(despachad|para\s+despach)/i.test(t) || /n[ãa]o\s+inclui\s+bagagem/i.test(t);

  const checkedMatch =
    /despachad|checked|por[ãa]o|hold\s+bag|bagagem\s+inclu[ií]da|\b\d{1,2}\s*kg\b/i.test(t) && !semBagagem;

  let pieces: number | null = null;
  const pieceMatch = t.match(/(\d{1,2})\s*(?:x|peça|peca|pc|pcs|bagage?n?s?)\b/i);
  if (pieceMatch) pieces = Number(pieceMatch[1]);

  let weight: number | null = null;
  const weightMatch = t.match(/(\d{1,2})\s*kg/i);
  if (weightMatch) {
    const kg = Number(weightMatch[1]);
    if (kg >= 15) weight = kg;
  }

  return {
    checkedBaggage: checkedMatch || (weight != null && weight >= 15),
    carryOn: !/sem\s+bagagem\s+de\s+m[ãa]o/i.test(t),
    personalItem: true,
    checkedPieces: checkedMatch ? (pieces ?? 1) : null,
    checkedWeightKg: weight,
    text: t || null,
  };
}
