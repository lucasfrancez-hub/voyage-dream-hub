/**
 * Utilitários de texto para WhatsApp.
 * SERVER-ONLY.
 */

/** "LUCAS ROCHA FRANCEZ" → "Lucas", "maria" → "Maria", "" → null */
export function firstName(full: string | null | undefined): string | null {
  if (!full) return null;
  const raw = full.trim().split(/\s+/)[0];
  if (!raw) return null;
  return capitalizeName(raw);
}

/** Coloca a primeira letra em maiúsculo, resto minúsculo. Preserva acentos. */
export function capitalizeName(word: string): string {
  const lower = word.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

/** Capitaliza a primeira letra do texto (respeitando espaços iniciais). */
export function capitalizeSentenceStart(text: string): string {
  return text.replace(/^(\s*)([\p{Ll}])/u, (_m, ws, c: string) => ws + c.toLocaleUpperCase("pt-BR"));
}

/**
 * Aplica capitalização inicial em cada balão (separados por \n+).
 * Não mexe no meio do balão pra manter o tom informal.
 */
export function capitalizeBubbles(fullText: string): string {
  return fullText
    .split(/\n+/)
    .map((line) => capitalizeSentenceStart(line))
    .join("\n\n");
}

/** Prefixo estilo "*Roberto:*\n" pra colocar no início do primeiro balão. */
export function buildSenderPrefix(name: string | null | undefined): string | null {
  const fn = firstName(name);
  if (!fn) return null;
  return `*${fn}:*`;
}
