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
  const { uazDownloadMedia, uazResolveMedia } = await import("./uaz-channel.server");
  const { deveIgnorarParaIA } = await import("./ai-silence.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Em mensagens que NÓS enviamos, o "senderName" é o nosso próprio perfil
  // (VIA AIR) — nunca pode virar o nome do contato.
  const conv = await getOrCreateConversation(msg.phone, msg.fromMe ? null : msg.senderName);

  // Foto de perfil: busca uma vez por conversa (por processo) quando ainda
  // não temos. Falhas marcam fetched_at pra não ficar tentando a cada msg.
  if (!(conv as { profile_pic_url?: string | null }).profile_pic_url && !profilePicAttempted.has(conv.id)) {
    profilePicAttempted.add(conv.id);
    try {
      const { uazFetchProfilePic } = await import("./uaz-channel.server");
      const pic = await uazFetchProfilePic(msg.phone);
      await supabaseAdmin
        .from("wa_conversations")
        .update({ profile_pic_url: pic, profile_pic_fetched_at: new Date().toISOString() })
        .eq("id", conv.id)
        .is("profile_pic_url", null);
      if (pic) (conv as { profile_pic_url?: string | null }).profile_pic_url = pic;
    } catch (err) {
      console.error("[uaz-ingest] foto de perfil falhou:", err);
    }
  }




  // Mensagens que nós mesmos enviamos pelo celular entram como histórico
  // (outbound humano) — nunca acionam a IA.
  const direction: "inbound" | "outbound" = msg.fromMe ? "outbound" : "inbound";

  let content = msg.text?.trim() ?? "";
  let transcricao: string | null = null;
  let tipo = msg.type;

  if (msg.type !== "text" && msg.type !== "other") {
    // O webhook entrega a URL criptografada do WhatsApp; a UazAPI descriptografa.
    const resolvida = await uazResolveMedia(msg.id);
    const url = resolvida?.url ?? msg.mediaUrl;
    const media = url ? await uazDownloadMedia(url) : null;
    if (media) {
      const mime = resolvida?.mimeType ?? media.mimeType ?? msg.mimeType ?? "application/octet-stream";
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
        const kind =
          msg.type === "document"
            ? "document"
            : msg.type === "video"
              ? "video"
              : msg.type === "sticker"
                ? "sticker"
                : "image";
        const label =
          kind === "image"
            ? "🖼️ [imagem recebida]"
            : kind === "video"
              ? "🎬 [vídeo recebido]"
              : kind === "sticker"
                ? "🩷 [figurinha recebida]"
                : "📎 [documento recebido]";

        // ANÁLISE MULTIMODAL — mesma infraestrutura do canal Meta: a leitura da
        // imagem vira parte do conteúdo, antes de qualquer agente responder.
        let analiseBloco = "";
        try {
          const { analyzeImage, isAnalyzableImage, buildAnalysisBlock } = await import("./image-vision.server");
          if (isAnalyzableImage(mime)) {
            console.log(
              JSON.stringify({
                event: "image_received",
                conversation_id: conv.id,
                wa_message_id: msg.id,
                mime_type: mime,
                bytes: media.blob.size,
                at: new Date().toISOString(),
              }),
            );
            const analysis = await analyzeImage({
              blob: media.blob,
              mimeType: mime,
              caption: content,
              conversationId: conv.id,
            });
            analiseBloco = `\n${buildAnalysisBlock(analysis)}`;
          }
        } catch (err) {
          console.error("[uaz-ingest] análise de imagem falhou:", err);
        }

        content = stored
          ? `[[media:${kind}|${stored.url}|${stored.filename}]]\n${content || label}${analiseBloco}`
          : `${content || label}${analiseBloco}`;
        tipo = kind;
      }

    }
  }

  // Mídia que não pôde ser baixada não pode sumir: registra um aviso claro.
  if (!content && msg.type !== "text") {
    content =
      msg.type === "audio"
        ? "🎤 [sistema · midia_indisponivel] Chegou um áudio, mas não foi possível baixá-lo. Peça ao cliente, de forma natural, que reenvie ou escreva a mensagem."
        : "📎 [sistema · midia_indisponivel] Chegou um arquivo que não foi possível baixar. Peça ao cliente que reenvie.";
  }

  if (!content) return "ignorada";

  // Resposta citada (reply): guarda a referência pra aparecer no balão, igual
  // ao canal Meta. Se a mensagem original não estiver no banco, o snippet que
  // a UazAPI mandou já garante a prévia.
  let replySender: string | null = null;
  if (msg.replyId) {
    const { data: quoted } = await supabaseAdmin
      .from("wa_messages")
      .select("direction, sender")
      .eq("wa_message_id", msg.replyId)
      .maybeSingle();
    if (quoted) replySender = quoted.direction === "outbound" ? "me" : (quoted.sender ?? "customer");
    else replySender = msg.fromMe ? "customer" : "me";
  }

  const saved = await saveMessage({
    conversation_id: conv.id,
    direction,
    sender: msg.fromMe ? "human" : "customer",
    content,
    wa_message_id: msg.id,
    ...(msg.replyId
      ? {
          reply_to_wa_id: msg.replyId,
          reply_to_snippet: msg.replySnippet ?? null,
          reply_to_sender: replySender,
        }
      : {}),
    message_type: tipo === "other" ? "text" : tipo,
    transcricao,
    // Horário REAL do WhatsApp — mantém a ordem cronológica exata na conversa.
    created_at: new Date(msg.timestampMs).toISOString(),
    ...(opts.historico ? { skip_protocolo: true } : {}),
  });

  if (!saved) return "duplicada";

  // Resposta enviada pelo celular (fora do chatbot): entra na conversa como
  // atendimento humano, assume o comando e cancela qualquer resposta da IA
  // que estivesse agendada — evita IA e humano falando ao mesmo tempo.
  if (direction === "outbound" && !opts.historico) {
    await supabaseAdmin
      .from("wa_conversations")
      .update({ mode: "human", ai_debounce_until: null })
      .eq("id", conv.id);
    return "salva";
  }

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
