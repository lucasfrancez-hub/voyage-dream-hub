/**
 * Versão CLIENTE dos helpers de texto (funções puras, sem env/imports server-only).
 */

export function firstName(full: string | null | undefined): string | null {
  if (!full) return null;
  const raw = full.trim().split(/\s+/)[0];
  if (!raw) return null;
  const lower = raw.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}
