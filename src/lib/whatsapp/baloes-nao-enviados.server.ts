/**
 * BALÕES GRAVADOS E NUNCA ENVIADOS.
 *
 * O runner salva os balões da IA no banco ANTES de chamar a Meta. Se o worker
 * morrer entre o insert e o envio (timeout, crash, deploy), a linha fica no
 * chat com `wa_message_id = null` e `error = null` — ou seja: aparece no nosso
 * painel como se tivesse sido dita, mas o cliente NUNCA recebeu.
 *
 * Esta varredura roda no watchdog: pega balões de texto presos há mais de 60s,
 * reenvia pela Meta e grava o wa_message_id (ou o erro real). Nunca considerar
 * uma mensagem entregue só porque foi salva internamente.
 *
 * SERVER-ONLY.
 */
const log = (o: Record<string, unknown>) =>
  console.log(JSON.stringify({ ...o, at: new Date().toISOString() }));

/** Tempo mínimo sem wa_message_id antes de considerar que o envio não saiu. */
export const BALAO_PRESO_MS = 60_000;
/** Não tenta reenviar mensagens muito antigas (contexto já perdido). */
export const BALAO_LIMITE_MS = 30 * 60 * 1000;

export async function sweepBaloesNaoEnviados(limite = 30): Promise<{
  presos: number;
  reenviados: number;
  falhas: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const agora = Date.now();

  const { data, error } = await supabaseAdmin
    .from("wa_messages")
    .select("id, conversation_id, content, created_at, media_url")
    .eq("direction", "outbound")
    .is("wa_message_id", null)
    .is("error", null)
    .is("deleted_at", null)
    .is("media_url", null)
    .lt("created_at", new Date(agora - BALAO_PRESO_MS).toISOString())
    .gt("created_at", new Date(agora - BALAO_LIMITE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(limite);

  if (error) {
    console.warn("[balao-nao-enviado] leitura falhou:", error.message);
    return { presos: 0, reenviados: 0, falhas: 0 };
  }

  const linhas = (data ?? []) as {
    id: string;
    conversation_id: string;
    content: string | null;
    created_at: string;
  }[];
  if (!linhas.length) return { presos: 0, reenviados: 0, falhas: 0 };

  const { sendWhatsAppText } = await import("./send.server");
  const telefones = new Map<string, string | null>();
  let reenviados = 0;
  let falhas = 0;

  for (const m of linhas) {
    const texto = (m.content ?? "").trim();
    if (!texto) continue;

    if (!telefones.has(m.conversation_id)) {
      const { data: conv } = await supabaseAdmin
        .from("wa_conversations")
        .select("wa_phone")
        .eq("id", m.conversation_id)
        .maybeSingle();
      telefones.set(m.conversation_id, (conv as { wa_phone?: string } | null)?.wa_phone ?? null);
    }
    const phone = telefones.get(m.conversation_id);
    if (!phone) continue;

    const res = await sendWhatsAppText(phone, texto);
    if (res.id) {
      await supabaseAdmin
        .from("wa_messages")
        .update({ wa_message_id: res.id, delivery_status: "sent", error: null })
        .eq("id", m.id)
        .is("wa_message_id", null);
      reenviados += 1;
      log({ event: "balao_reenviado", message_id: m.id, conversation_id: m.conversation_id });
    } else {
      await supabaseAdmin
        .from("wa_messages")
        .update({ error: res.error ?? "Não entregue pelo WhatsApp" })
        .eq("id", m.id);
      falhas += 1;
      log({
        event: "balao_reenvio_falhou",
        message_id: m.id,
        conversation_id: m.conversation_id,
        erro: res.error ?? null,
      });
    }
  }

  return { presos: linhas.length, reenviados, falhas };
}
