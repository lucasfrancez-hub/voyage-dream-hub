/**
 * LOG DE DIAGNÓSTICO DAS ARTES DE VOO (uso interno).
 *
 * Registra em log estruturado o ciclo de vida de cada arte: geração,
 * elegibilidade, envio e falha. Nada daqui é exibido ao cliente — é
 * exclusivamente para diagnóstico interno da equipe.
 *
 * Formato: uma linha JSON prefixada por `[card-log]`, fácil de filtrar
 * nos logs do servidor.
 */

export type CardLogEvent = "card_generated" | "card_eligible" | "card_sent" | "card_failed";

export type CardLogEntry = {
  event: CardLogEvent;
  conversation_id?: string | null;
  quote_id?: string | null;
  /** índice da opção dentro da cotação (1 = primeira arte). */
  option_index?: number | null;
  /** quando a arte foi renderizada. */
  generated_at?: string | null;
  /** quando a arte ficou elegível para envio (fim do intervalo). */
  eligible_at?: string | null;
  /** quando o envio foi concluído. */
  sent_at?: string | null;
  /** id/erro devolvido pela Meta. */
  meta_status?: string | null;
  meta_message_id?: string | null;
  /** intervalo real entre esta arte e a anterior, em segundos. */
  gap_seconds?: number | null;
  /** em falhas: etapa em que quebrou. */
  stage?: "render" | "upload" | "send" | "persist" | "unknown" | null;
  reason?: string | null;
  fallback_sent?: boolean | null;
};

export function logCardEvent(entry: CardLogEntry): void {
  const linha = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.event === "card_failed") console.warn(`[card-log] ${linha}`);
  else console.log(`[card-log] ${linha}`);
}

/** Diferença em segundos entre dois instantes (null quando faltar algum). */
export function gapSeconds(anterior: number | null | undefined, agora: number): number | null {
  if (!anterior) return null;
  return Math.round((agora - anterior) / 1000);
}
