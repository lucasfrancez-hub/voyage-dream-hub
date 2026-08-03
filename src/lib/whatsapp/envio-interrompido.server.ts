/**
 * ENVIOS INTERROMPIDOS ("não entregue" no painel).
 *
 * Quando o worker morre no meio do upload da arte, a linha da mensagem fica
 * marcada com o claim `__sending__` e sem `wa_message_id`: o balão aparece
 * como "não entregue" no chat e a opção nunca mais sai, porque a trava de
 * idempotência enxerga a mensagem já gravada e pula o reenvio.
 *
 * Esta rotina roda a cada minuto pelo watchdog: mensagens presas há mais de
 * 90s são apagadas (nunca chegaram ao cliente) e a opção correspondente volta
 * pra fila de entrega.
 *
 * SERVER-ONLY.
 */
const log = (o: Record<string, unknown>) =>
  console.log(JSON.stringify({ ...o, at: new Date().toISOString() }));

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

/** Tempo mínimo preso antes de considerar o envio abortado. */
export const ENVIO_PRESO_MS = 90_000;

export async function sweepEnviosInterrompidos(limite = 50): Promise<{
  presas: number;
  reenfileiradas: number;
}> {
  const supabaseAdmin = await db();
  const limite_tempo = new Date(Date.now() - ENVIO_PRESO_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("wa_messages")
    .select("id, conversation_id, quote_id, option_index, created_at")
    .eq("direction", "outbound")
    .eq("error", "__sending__")
    .is("wa_message_id", null)
    .lt("created_at", limite_tempo)
    .limit(limite);
  if (error) {
    console.warn("[envio-interrompido] leitura falhou:", error.message);
    return { presas: 0, reenfileiradas: 0 };
  }

  const linhas = (data ?? []) as {
    id: string;
    conversation_id: string;
    quote_id: string | null;
    option_index: number | null;
    created_at: string;
  }[];
  if (!linhas.length) return { presas: 0, reenfileiradas: 0 };

  let reenfileiradas = 0;
  for (const m of linhas) {
    // O balão nunca chegou ao cliente: some com ele pra não poluir o chat e
    // pra liberar a trava de idempotência do reenvio.
    await supabaseAdmin.from("wa_messages").delete().eq("id", m.id);

    if (!m.quote_id || m.option_index == null) continue;
    const { data: opt } = await supabaseAdmin
      .from("wa_flight_quote_options")
      .select("id, delivery_status, attempt_count, provider_message_id")
      .eq("quote_id", m.quote_id)
      .eq("option_index", m.option_index - 1)
      .maybeSingle();
    const linha = opt as
      | { id: string; delivery_status: string; attempt_count: number | null; provider_message_id: string | null }
      | null;
    if (!linha) continue;
    // Se o provedor confirmou depois, deixa quieto (o reconciliador resolve).
    if (linha.provider_message_id) continue;
    if (["delivered_card", "delivered_text", "cancelled", "failed_final"].includes(linha.delivery_status)) {
      continue;
    }

    await supabaseAdmin
      .from("wa_flight_quote_options")
      .update({
        delivery_status: "failed_recoverable",
        claim_id: null,
        claim_expires_at: null,
        next_run_at: new Date().toISOString(),
      })
      .eq("id", linha.id);
    reenfileiradas += 1;
    log({
      event: "flight_delivery_envio_interrompido",
      quote_id: m.quote_id,
      option_index: m.option_index,
      conversation_id: m.conversation_id,
    });
  }

  return { presas: linhas.length, reenfileiradas };
}
