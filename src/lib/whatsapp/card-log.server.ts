/**
 * LOG DE DIAGNÓSTICO DAS ARTES DE VOO (uso interno).
 *
 * Registra em log estruturado o ciclo de vida de cada arte: geração,
 * elegibilidade, upload, envio, status real da Meta, falha e fallback em
 * texto. Nada daqui é exibido ao cliente — é exclusivamente para diagnóstico
 * interno da equipe.
 *
 * Formato: uma linha JSON prefixada por `[card-log]`, fácil de filtrar
 * nos logs do servidor.
 */

export type CardLogEvent =
  | "card_generated"
  | "card_eligible"
  | "card_sent"
  | "card_failed"
  | "card_status"
  | "card_cancelled"
  | "card_delivery_delayed"
  | "option_resent";

/** Etapa exata em que a entrega quebrou — nunca use um genérico "send". */
export type CardFailureStage =
  | "html_generation"
  | "image_render"
  | "file_storage"
  | "meta_media_upload"
  | "meta_message_send"
  | "meta_delivery"
  | "fallback_generation"
  | "fallback_send"
  | "pending_processing"
  | "unknown";

/** Status real da entrega (só muda para delivered/read via webhook da Meta). */
export type CardDeliveryStatus =
  | "generated"
  /** arte reaproveitada do cache de renderização (mesma assinatura da opção). */
  | "generated_from_cache"
  | "uploaded"
  | "sent"
  | "delivered"
  | "read"
  | "failed";


export type CardLogEntry = {
  event: CardLogEvent;
  conversation_id?: string | null;
  quote_id?: string | null;
  /** índice da opção dentro da cotação (1 = primeira arte). */
  option_index?: number | null;
  card_type?: string | null;
  /** referência do arquivo no storage. */
  storage_reference?: string | null;
  /** quando a arte foi renderizada. */
  generated_at?: string | null;
  /** quando a arte ficou elegível para envio (fim do intervalo). */
  eligible_at?: string | null;
  /** quando o worker começou a processar esta opção. */
  processed_at?: string | null;
  /** quando os bytes terminaram de subir para a Meta. */
  uploaded_at?: string | null;
  /** quando o envio foi concluído. */
  sent_at?: string | null;
  meta_media_id?: string | null;
  meta_message_id?: string | null;
  delivery_status?: CardDeliveryStatus | null;
  /** intervalo real entre esta arte e a anterior, em segundos. */
  gap_seconds?: number | null;
  /** em falhas: etapa em que quebrou. */
  failed_stage?: CardFailureStage | null;
  failure_reason?: string | null;
  retry_count?: number | null;
  timestamp?: string | null;
  fallback_sent?: boolean | null;
  fallback_status?: "sent" | "failed" | "skipped" | null;
  fallback_message_id?: string | null;
  /** reenvio: formato realmente usado na reentrega. */
  resend_format?: "card" | "texto" | null;
};

export function logCardEvent(entry: CardLogEntry): void {
  const linha = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  });
  if (entry.event === "card_failed" || entry.event === "card_delivery_delayed") {
    console.warn(`[card-log] ${linha}`);
  } else {
    console.log(`[card-log] ${linha}`);
  }
}

/** Janela esperada entre a 1ª e a 2ª arte. Acima disso vira alerta interno. */
export const GAP_ALERTA_SEGUNDOS = 90;

/**
 * Alerta INTERNO (nunca exibido ao cliente) quando a segunda arte demorou
 * mais que a janela esperada de 30 a 90 segundos.
 */
export function logCardDelayIfNeeded(entry: {
  conversation_id?: string | null;
  quote_id?: string | null;
  option_index?: number | null;
  gap_seconds?: number | null;
}): void {
  if (typeof entry.gap_seconds !== "number") return;
  if (entry.gap_seconds <= GAP_ALERTA_SEGUNDOS) return;
  logCardEvent({ ...entry, event: "card_delivery_delayed" });
}

/** Diferença em segundos entre dois instantes (null quando faltar algum). */
export function gapSeconds(anterior: number | null | undefined, agora: number): number | null {
  if (!anterior) return null;
  return Math.round((agora - anterior) / 1000);
}
