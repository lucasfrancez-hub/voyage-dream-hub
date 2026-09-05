/**
 * Ponte Instagram → inbox do chatbot.
 *
 * As DMs do Instagram vivem em `instagram_conversations` / `instagram_messages`,
 * mas o painel (/chat) lê de `wa_conversations` / `wa_messages`. Aqui espelhamos
 * cada DM numa conversa "virtual" com `wa_phone = ig:<contact_ig_id>` e
 * `meta.channel = "instagram"`, pra que apareça no mesmo inbox.
 */

export const IG_PREFIX = "ig:";

export function isInstagramConversation(waPhone: string | null | undefined) {
  return !!waPhone?.startsWith(IG_PREFIX);
}

export function igContactIdFromPhone(waPhone: string) {
  return waPhone.slice(IG_PREFIX.length);
}

type MirrorInput = {
  igAccountRowId: string;
  igConversationId: string;
  contactIgId: string;
  displayName?: string | null;
  username?: string | null;
  profilePic?: string | null;
  direction: "inbound" | "outbound";
  text: string | null;
  messageType?: string | null;
  attachmentUrl?: string | null;
  igMessageId?: string | null;
  timestamp?: number | null;
  /** Backfill histórico: não abre/atualiza protocolo. */
  skipProtocolo?: boolean;
};

/** Cria/atualiza a conversa espelho e grava a mensagem no inbox do chat. */
export async function mirrorInstagramMessage(input: MirrorInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const waPhone = `${IG_PREFIX}${input.contactIgId}`;
  const preview = (input.text ?? "[mídia]").slice(0, 140);
  const when = new Date(input.timestamp ?? Date.now()).toISOString();

  const { data: existing } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, meta, unread_count, display_name")
    .eq("wa_phone", waPhone)
    .maybeSingle();

  let conversationId = existing?.id ?? null;

  if (!conversationId) {
    const { data: created, error } = await supabaseAdmin
      .from("wa_conversations")
      .insert({
        wa_phone: waPhone,
        display_name:
          input.displayName ?? (input.username ? `@${input.username}` : `Instagram ${input.contactIgId.slice(-6)}`),
        last_message_at: when,
        last_message_preview: preview,
        unread_count: input.direction === "inbound" ? 1 : 0,
        meta: {
          channel: "instagram",
          ig_account_id: input.igAccountRowId,
          ig_conversation_id: input.igConversationId,
          ig_contact_id: input.contactIgId,
          ig_username: input.username ?? null,
          ig_profile_pic: input.profilePic ?? null,
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(`espelho instagram: ${error.message}`);
    conversationId = created!.id;
  } else {
    const meta = (existing?.meta ?? {}) as Record<string, unknown>;
    await supabaseAdmin
      .from("wa_conversations")
      .update({
        last_message_at: when,
        last_message_preview: preview,
        unread_count:
          input.direction === "inbound" ? (existing?.unread_count ?? 0) + 1 : existing?.unread_count ?? 0,
        ...(input.displayName &&
        (!existing?.display_name || existing.display_name.startsWith("Instagram ") || existing.display_name === "sem nome")
          ? { display_name: input.displayName }
          : {}),
        meta: {
          ...meta,
          channel: "instagram",
          ig_account_id: input.igAccountRowId,
          ig_conversation_id: input.igConversationId,
          ig_contact_id: input.contactIgId,
          ...(input.username ? { ig_username: input.username } : {}),
          ...(input.profilePic ? { ig_profile_pic: input.profilePic } : {}),
        },
      })
      .eq("id", conversationId);
  }

  const { saveMessage } = await import("@/lib/whatsapp/conversation.server");

  // MÍDIA DO INSTAGRAM: o link da Meta expira em poucas horas. Baixamos o
  // arquivo, guardamos no nosso bucket e gravamos o marcador [[media:…]] pra
  // que o áudio toque no chat (não só a transcrição), e a foto/vídeo abram.
  let content = input.text ?? (input.attachmentUrl ? "[mídia do Instagram]" : "[mensagem]");
  let transcricao: string | null = null;
  const kind =
    input.messageType === "audio" || input.messageType === "image" || input.messageType === "video"
      ? input.messageType
      : null;

  if (input.attachmentUrl && kind) {
    try {
      const { storeInboundMedia, transcribeAudio, extFromMime } = await import("@/lib/whatsapp/media.server");
      const resp = await fetch(input.attachmentUrl);
      const blob = resp.ok ? await resp.blob() : null;
      if (blob && blob.size > 0) {
        // O Instagram entrega voz como video/mp4; para nós é áudio.
        const mimeBruto = blob.type || (kind === "video" ? "video/mp4" : kind === "image" ? "image/jpeg" : "audio/mp4");
        const mime = kind === "audio" ? "audio/mp4" : mimeBruto;

        const stored = await storeInboundMedia({
          conversationId: conversationId!,
          blob,
          mimeType: mime,
          filename: `ig-${kind}-${input.igMessageId ?? Date.now()}.${extFromMime(mime)}`,
        });
        let texto = input.text?.trim() || (kind === "audio" ? "🎤 [áudio recebido]" : kind === "video" ? "🎬 [vídeo recebido]" : "🖼️ [imagem recebida]");
        if (kind === "audio") {
          transcricao = await transcribeAudio(blob, mime);
          texto = transcricao
            ? `🎤 [áudio transcrito] ${transcricao}`
            : "🎤 [sistema · transcricao_falhou] Não foi possível transcrever este áudio. Peça ao cliente, de forma natural, que reenvie o áudio ou escreva a mensagem.";
        } else if (kind === "image") {
          try {
            const { analyzeImage, isAnalyzableImage, buildAnalysisBlock } = await import(
              "@/lib/whatsapp/image-vision.server"
            );
            if (isAnalyzableImage(mime)) {
              const analysis = await analyzeImage({
                blob,
                mimeType: mime,
                caption: input.text ?? "",
                conversationId: conversationId!,
              });
              texto = `${texto}\n${buildAnalysisBlock(analysis)}`;
            }
          } catch (err) {
            console.error("[instagram/bridge] análise de imagem falhou:", err);
          }
        }
        if (stored) content = `[[media:${kind}|${stored.url}|${stored.filename}]]\n${texto}`;
        else content = texto;
      }
    } catch (err) {
      console.error("[instagram/bridge] mídia não pôde ser baixada:", err);
    }
  }

  await saveMessage({
    conversation_id: conversationId!,
    direction: input.direction,
    sender: input.direction === "inbound" ? "customer" : "human",
    content,
    wa_message_id: input.igMessageId ?? null,
    message_type: input.messageType ?? "text",
    transcricao,
    skip_protocolo: input.skipProtocolo ?? false,
  });

  return { conversationId: conversationId!, waPhone };
}

