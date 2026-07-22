// Remove jargões de broker/operadora dos campos de quarto vindos de vouchers
// (ex.: "Standard Frete", "Superior Broker", "Luxo Tarifa Net").
// Retorna null quando sobra vazio.
const BROKER_TOKENS = /\b(frete|broker|tarifa|net|pacote|comiss(?:ão|ao)|comission|comm|fee|markup|contratada?|contrato|revenda|operadora|hotel(?:eiro|eira)?|distribui[çc][aã]o)\b/gi;

export function cleanRoomLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value);
  if (!raw.trim()) return null;
  const cleaned = raw
    .replace(BROKER_TOKENS, " ")
    .replace(/[–—-]\s*$/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;/|.\-–—]+|[\s,;/|.\-–—]+$/g, "")
    .trim();
  return cleaned || null;
}
