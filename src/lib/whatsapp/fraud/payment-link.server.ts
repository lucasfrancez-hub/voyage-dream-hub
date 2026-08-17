/**
 * Item 15/16 — liga eventos de pagamento à conversa de WhatsApp correspondente
 * para que o score antifraude continue vivo depois que o Lucas assume.
 *
 * Só metadados seguros trafegam aqui: status, tentativas, método, resultado do
 * gateway. Nunca número completo de cartão, nunca CVV.
 */
import type { FraudPaymentMeta } from "./dynamic";

/** Descobre a conversa ligada a um pedido (via orçamento público). */
export async function resolveConversationForOrder(orderId: string): Promise<string | null> {
  if (!orderId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("public_quotes")
    .select("conversation_id, created_at")
    .eq("order_id", orderId)
    .not("conversation_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { conversation_id?: string | null } | null)?.conversation_id ?? null;
}

/** Registra o evento de pagamento no score, se houver conversa vinculada. */
export async function reportOrderPaymentToFraud(input: {
  order_id?: string | null;
  conversation_id?: string | null;
  meta: Partial<FraudPaymentMeta>;
  label?: string;
}): Promise<void> {
  try {
    const conversationId =
      input.conversation_id ??
      (input.order_id ? await resolveConversationForOrder(input.order_id) : null);
    if (!conversationId) return;
    const { registerFraudPaymentEvent } = await import("./engine.server");
    await registerFraudPaymentEvent({
      conversation_id: conversationId,
      meta: input.meta,
      label: input.label,
    });
  } catch (err) {
    // nunca deixar o antifraude quebrar o fluxo de pagamento
    console.error("[fraud] evento de pagamento não registrado:", (err as Error).message);
  }
}
