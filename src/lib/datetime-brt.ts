/**
 * Relógio oficial do sistema: America/Sao_Paulo.
 *
 * O servidor roda em UTC, então qualquer "hoje"/"agora" calculado com
 * `new Date().toISOString()` vira o dia seguinte a partir das 21h de Brasília.
 * Use estes helpers sempre que a data/hora for mostrada a alguém (cliente,
 * arte, IA) ou usada como "dia corrente".
 */

export const FUSO_BR = "America/Sao_Paulo";

/** Data de hoje em Brasília no formato YYYY-MM-DD. */
export function hojeBRT(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Data (YYYY-MM-DD) de um instante qualquer, no fuso de Brasília. */
export function dataBRT(iso: string | Date): string | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : hojeBRT(d);
}

/** Hora atual em Brasília (0–23). */
export function horaBRT(d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_BR, hour: "2-digit", hour12: false }).format(d),
  );
}

/** Saudação conforme o horário de Brasília. */
export function saudacaoBRT(d: Date = new Date()): string {
  const h = horaBRT(d);
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Data e hora atuais por extenso, no fuso de Brasília (para prompts de IA). */
export function agoraBRTTexto(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BR,
    dateStyle: "full",
    timeStyle: "short",
  }).format(d);
}
