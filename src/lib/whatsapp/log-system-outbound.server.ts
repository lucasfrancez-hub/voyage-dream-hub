/**
 * Registra na conversa do WhatsApp uma mensagem enviada AUTOMATICAMENTE pelo sistema
 * (check-in, confirmação de pedido, alerta de voo, cobrança etc.).
 *
 * Objetivo: manter contexto pra IA (Camila) entender de que assunto o cliente está
 * respondendo. Sem isso, a IA "acorda" sem saber que a gente acabou de mandar cartão
 * de embarque / alteração de voo / etc.
 *
 * SERVER-ONLY.
 */
import { getOrCreateConversation, saveMessage } from "./conversation.server";

export type SystemOutboundKind =
  | "checkin_boarding_pass"
  | "flight_change_alert"
  | "flight_cancel_alert"
  | "order_confirmation"
  | "payment_receipt"
  | "voucher"
  | "contract"
  | "generic";

export async function logSystemOutbound(input: {
  wa_phone: string;
  kind: SystemOutboundKind;
  /** Texto humano do que foi enviado (o próprio caption/mensagem quando houver). */
  summary: string;
  /** ID retornado pelo provedor (Meta/UazAPI), se houver. */
  wa_message_id?: string | null;
  /** Metadados úteis pra IA (order_id, locator, flight_number, alert_id...). */
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    if (!input.wa_phone) return;
    const conv = await getOrCreateConversation(input.wa_phone);

    const header = `[sistema · ${input.kind}]`;
    const metaLine = input.meta && Object.keys(input.meta).length
      ? "\n" + Object.entries(input.meta)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => `• ${k}: ${String(v)}`)
          .join("\n")
      : "";

    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "system",
      content: `${header}\n${input.summary}${metaLine}`.trim(),
      wa_message_id: input.wa_message_id ?? null,
      tool_calls: { auto: true, kind: input.kind, ...(input.meta ?? {}) },
      skip_protocolo: true,
    });
  } catch (err) {
    console.warn(
      "[logSystemOutbound] falhou (mensagem original preservada):",
      err instanceof Error ? err.message : err,
    );
  }
}
