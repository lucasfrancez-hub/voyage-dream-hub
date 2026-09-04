/**
 * Ingestão de mensagens do WhatsApp vindas da UazAPI (canal do chatbot).
 *
 * Vale tanto para o webhook em tempo real quanto para a sincronização do
 * histórico. REGRA FIXA: mensagens dentro da janela de silêncio (histórico e
 * as de hoje, até o fim do dia) são apenas registradas — a IA não responde.
 *
 * SERVER-ONLY.
 */

import type { UazNormalized } from "./uaz-channel.server";

export type IngestResult = "salva" | "duplicada" | "ignorada" | "agendada";

export async function ingestUazMessage(
  msg: UazNormalized,
  opts: { historico?: boolean } = {},
): Promise<IngestResult> {
  if (!msg.phone) return "ignorada"; // grupos, canais e status não entram no chatbot

  const { getOrCreateConversation, saveMessage } = await import("./conversation.server");
  const { transcribeAudio, storeInboundMedia, extFromMime } = await import("./media.server");
  const { uazDownloadMedia } = await import("./uaz-channel.server");
  const { deveIgnorarParaIA } = await import("./ai-silence.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const conv = await getOrCreateConversation(msg.phone, msg.senderName);

  // Mensagens que nós mesmos enviamos pelo celular entram como histórico
  // (outbound humano) — nunca acionam a IA.
  const direction: "inbound" | "outbound" = msg.fromMe ? "outbound" : "inbound";

  let content = msg.text?.trim() ?? "";
  let transcricao: string | null = null;
  let tipo = msg.type === "sticker" ? "image" : msg.type;

  if (msg.type !== "text" && msg.mediaUrl) {
    const media = await uazDownloadMedia(msg.mediaUrl);
    if (media) {
      const mime = msg.mimeType ?? media.mimeType;
      const filename = msg.filename ?? `${msg.type}-${msg.id}.${extFromMime(mime)}`;
      const stored = await storeInboundMedia({
        conversationId: conv.id,
        blob: media.blob,
        mimeType: mime,
        filename,
      });
      if (msg.type === "audio") {
        transcricao = await transcribeAudio(media.blob, mime);
        const texto = transcricao
          ? `🎤 [áudio transcrito] ${transcricao}`
          : "🎤 [sistema · transcricao_falhou] Não foi possível transcrever este áudio. Peça ao cliente, de forma natural, que reenvie o áudio ou escreva a mensagem. NÃO tente adivinhar o conteúdo.";
        content = stored ? `[[media:audio|${stored.url}|${stored.filename}]]\n${texto}` : texto;
      } else {
        const kind = msg.type === "document" ? "document" : msg.type === "video" ? "video" : "image";
        const label =
          kind === "image" ? "🖼️ [imagem recebida]" : kind === "video" ? "🎬 [vídeo recebido]" : "📎 [documento recebido]";
        content = stored
          ? `[[media:${kind}|${stored.url}|${stored.filename}]]\n${content || label}`
          : content || label;
        tipo = kind;
      }
    }
  }

  if (!content) return "ignorada";

  const saved = await saveMessage({
    conversation_id: conv.id,
    direction,
    sender: msg.fromMe ? "human" : "customer",
    content,
    wa_message_id: msg.id,
    message_type: tipo === "other" ? "text" : tipo,
    transcricao,
    ...(opts.historico ? { skip_protocolo: true } : {}),
  });

  if (!saved) return "duplicada";

  // Janela de silêncio: histórico e mensagens de hoje NÃO acionam a IA.
  if (direction === "outbound" || opts.historico) return "salva";
  if (await deveIgnorarParaIA(msg.timestampMs)) {
    console.log(
      JSON.stringify({ event: "ai_silenciada", conversation_id: conv.id, wa_message_id: msg.id }),
    );
    return "salva";
  }

  // Antifraude na ingestão, como no canal Meta.
  try {
    const { evaluateConversationFraud } = await import("./fraud/engine.server");
    await evaluateConversationFraud({ conversation_id: conv.id, message_id: saved.id ?? null, source: "auto" });
  } catch (err) {
    console.error("[uaz-ingest] antifraude falhou:", err);
  }

  // Debounce: mesma política do canal Meta (1 a 2 min, teto de 3 min).
  const { data: convState } = await supabaseAdmin
    .from("wa_conversations")
    .select("ai_debounce_until")
    .eq("id", conv.id)
    .maybeSingle();

  const curta = content.replace(/\[\[media:[^\]]+\]\]/g, "").trim().length <= 40;
  const waitMs = curta ? 60_000 : convState?.ai_debounce_until ? 120_000 : 90_000;

  const { data: lastOutbound } = await supabaseAdmin
    .from("wa_messages")
    .select("created_at")
    .eq("conversation_id", conv.id)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: firstPending } = await supabaseAdmin
    .from("wa_messages")
    .select("created_at")
    .eq("conversation_id", conv.id)
    .eq("direction", "inbound")
    .gt("created_at", lastOutbound?.created_at ?? "1970-01-01")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const desiredAt = Date.now() + waitMs;
  const hardCapAt = firstPending?.created_at
    ? new Date(firstPending.created_at).getTime() + 3 * 60 * 1000
    : desiredAt;
  const finalAt = Math.min(desiredAt, hardCapAt);

  const atual = convState?.ai_debounce_until ? new Date(convState.ai_debounce_until as string).getTime() : 0;
  const leaseAtivo = atual > Date.now() + 100_000;
  if (!leaseAtivo) {
    await supabaseAdmin
      .from("wa_conversations")
      .update({ ai_debounce_until: new Date(finalAt).toISOString() })
      .eq("id", conv.id);
  }

  return "agendada";
}
