/**
 * Utilitários para normalizar/exibir a origem dos pacotes.
 *
 * Motivação: às vezes o mesmo pacote entra como "Curitiba" e como "Curitiba (BR)",
 * o que duplica o filtro por origem. Aqui a gente remove o sufixo entre parênteses
 * e agrupa case-insensitive, mantendo o rótulo mais limpo pra exibir.
 */

export function canonOrigin(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/\s*\([^)]*\)\s*/g, " ") // remove "(BR)", "(Brasil)", etc.
    .replace(/\s+/g, " ")
    .trim();
}

export function originKey(raw: string | null | undefined): string {
  return canonOrigin(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Recebe uma lista bruta de origens e devolve os rótulos únicos (canônicos),
 * preferindo a versão mais curta como display quando há variações.
 */
export function dedupeOrigins(raws: Array<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const r of raws) {
    const label = canonOrigin(r);
    if (!label) continue;
    const key = originKey(r);
    const current = byKey.get(key);
    if (!current || label.length < current.length) byKey.set(key, label);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
