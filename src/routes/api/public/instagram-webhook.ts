import { createFileRoute } from "@tanstack/react-router";
import type { Json } from "@/integrations/supabase/types";

/**
 * Webhook Instagram Graph API (Meta).
 *
 * GET  → hub challenge (verify)
 * POST → mensagens (DMs) + comentários (mentions/comments) + deletions
 */
export const Route = createFileRoute("/api/public/instagram-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { instagramVerifyToken } = await import("@/lib/instagram/diagnostics.server");
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = instagramVerifyToken();
        const valid = mode === "subscribe" && Boolean(token && expected && token === expected);
        await supabaseAdmin.from("instagram_webhook_logs").insert({ method: request.method, query_string: url.search.slice(1), source_ip: sourceIp(request), headers: headersToJson(request.headers), event_type: "verification", validation_status: valid ? "verify_token_valid" : "verify_token_invalid", verify_token_valid: valid, rejection_reason: valid ? null : !expected ? "Verify Token não configurado no backend" : "Verify Token divergente", processing_status: valid ? "accepted" : "rejected", response_status: valid ? 200 : 403, processed_at: new Date().toISOString() });
        return valid ? new Response(challenge ?? "", { status: 200 }) : new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { instagramAppSecret, validateInstagramSignature } = await import("@/lib/instagram/diagnostics.server");
        const raw = await request.text();
        const signature = request.headers.get("x-hub-signature-256") ?? "";
        const appSecret = instagramAppSecret();
        let payload: IGPayload | null = null;
        let parseError: string | null = null;
        try { payload = JSON.parse(raw) as IGPayload; } catch (error) { parseError = error instanceof Error ? error.message : String(error); }
        const extracted = extractEvent(payload);
        const signatureCheck = appSecret ? validateInstagramSignature(raw, signature, appSecret) : { calculated: null, valid: false };
        const rejection = !appSecret ? "APP_SECRET não configurado" : !signature ? "Cabeçalho X-Hub-Signature-256 ausente" : !signatureCheck.valid ? "Assinatura SHA256 inválida" : parseError ? `JSON inválido: ${parseError}` : null;
        const inserted = await supabaseAdmin.from("instagram_webhook_logs").insert({ method: request.method, query_string: new URL(request.url).search.slice(1), source_ip: sourceIp(request), headers: headersToJson(request.headers), raw_body: raw, event_object: payload?.object ?? null, event_type: extracted.eventType, account_external_id: extracted.accountId, conversation_external_id: extracted.conversationId, message_external_id: extracted.messageId, sender_external_id: extracted.senderId, validation_status: rejection ? "rejected" : "signature_valid", signature_received: signature || null, signature_calculated: signatureCheck.calculated, signature_valid: signatureCheck.valid, rejection_reason: rejection, processing_status: rejection ? "rejected" : "processing", response_status: rejection ? (!appSecret ? 500 : 401) : 200 }).select("id").single();
        if (rejection) return new Response(rejection, { status: !appSecret ? 500 : 401 });
        try {
          await processPayload(payload as IGPayload);
          if (inserted.data?.id) await supabaseAdmin.from("instagram_webhook_logs").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("id", inserted.data.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (inserted.data?.id) await supabaseAdmin.from("instagram_webhook_logs").update({ processing_status: "failed", processing_error: message, processed_at: new Date().toISOString() }).eq("id", inserted.data.id);
          console.error("[ig-webhook] erro processando:", message);
        }
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});

function headersToJson(headers: Headers): Json { return Object.fromEntries(headers.entries()); }
function sourceIp(request: Request) { return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip"); }

type IGPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: { id: string };
      recipient?: { id: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        attachments?: Array<{ type: string; payload: { url: string } }>;
        is_deleted?: boolean;
        reply_to?: { mid?: string };
      };
    }>;
    changes?: Array<{
      field: string;
      value: Record<string, unknown>;
    }>;
  }>;
};

function extractEvent(payload: IGPayload | null) {
  const entry = payload?.entry?.[0];
  const messaging = entry?.messaging?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value as { conversation_id?: string; id?: string } | undefined;
  return { eventType: messaging?.message ? `message:${messaging.message.attachments?.[0]?.type ?? "text"}` : change?.field ?? payload?.object ?? "unknown", accountId: entry?.id ?? null, conversationId: value?.conversation_id ?? null, messageId: messaging?.message?.mid ?? value?.id ?? null, senderId: messaging?.sender?.id ?? null };
}

async function processPayload(payload: IGPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!payload.entry) throw new Error("Payload sem entradas");

  for (const entry of payload.entry) {
    const igAccountId = entry.id;
    if (!igAccountId) throw new Error("Evento sem ID da conta");

    // A conta pode chegar com o ID do Instagram Login (ig_user_id) ou com o
    // ID business 17841... (guardado em page_id). Aceita os dois.
    const { data: account } = await supabaseAdmin
      .from("instagram_accounts")
      .select("id, ig_user_id, page_id, access_token, metadata")
      .or(`ig_user_id.eq.${igAccountId},page_id.eq.${igAccountId}`)
      .maybeSingle();
    if (!account) throw new Error(`Conta ${igAccountId} não cadastrada`);
    const igToken = (account as { access_token?: string }).access_token ?? null;
    const igApiUserId = (account as { ig_user_id?: string }).ig_user_id ?? igAccountId;
    const { iaPodeResponderComentario } = await import("@/lib/instagram/ai-toggle");
    const { contaComIaAtiva } = await import("@/lib/instagram/ai-toggle");
    const iaAtiva = contaComIaAtiva((account as { metadata?: unknown }).metadata);
    const igMetadata = (account as { metadata?: unknown }).metadata;



    // ============ DMs ============
    for (const msg of entry.messaging ?? []) {
      if (!msg.message || !msg.sender?.id) continue;
      const senderId = msg.sender.id;
      const isFromMe = senderId === igAccountId;
      const contactIgId = isFromMe ? msg.recipient?.id : senderId;
      if (!contactIgId) continue;

      const { data: conv, error: convError } = await supabaseAdmin
        .from("instagram_conversations")
        .upsert(
          {
            account_id: account.id,
            contact_ig_id: contactIgId,
            last_message_at: new Date((msg.timestamp ?? Date.now())).toISOString(),
            last_message_preview: (msg.message.text ?? "[mídia]").slice(0, 140),
          },
          { onConflict: "account_id,contact_ig_id" },
        )
        .select("id, unread_count")
        .single();

      if (convError || !conv) throw new Error(convError?.message ?? "Falha ao criar conversa");
      const { error: messageError } = await supabaseAdmin.from("instagram_messages").upsert({
        conversation_id: conv!.id,
        ig_message_id: msg.message.mid ?? null,
        direction: isFromMe ? "outbound" : "inbound",
        message_type: msg.message.attachments?.[0]?.type ?? "text",
        text: msg.message.text ?? null,
        attachment_url: msg.message.attachments?.[0]?.payload?.url ?? null,
        attachment_type: msg.message.attachments?.[0]?.type ?? null,
        reply_to_ig_message_id: msg.message.reply_to?.mid ?? null,
        is_deleted: msg.message.is_deleted ?? false,
        status: isFromMe ? "sent" : "received",
      }, { onConflict: "ig_message_id", ignoreDuplicates: true });
      if (messageError) throw new Error(messageError.message);

      if (!isFromMe) {
        await supabaseAdmin
          .from("instagram_conversations")
            .update({ unread_count: (conv.unread_count ?? 0) + 1 })
            .eq("id", conv.id);
      }

      // Nome, @ e foto do contato — busca sempre que faltar algum dado,
      // inclusive quando o evento é um eco nosso (resposta privada a comentário).
      let contatoNome: string | null = null;
      let contatoUser: string | null = null;
      let contatoFoto: string | null = null;
      try {
        const { ensureInstagramContactProfile } = await import("@/lib/instagram/profile.server");
        const perfil = await ensureInstagramContactProfile({
          conversationId: conv.id,
          accountRowId: account.id,
          contactIgId,
        });
        contatoNome = perfil.name;
        contatoUser = perfil.username;
        contatoFoto = perfil.profile_pic;
      } catch (e) {
        console.error("[instagram] perfil do contato falhou:", (e as Error).message);
      }


      // Espelha no inbox do chatbot (/chat)
      let espelho: { waPhone: string } | null = null;
      try {
        const { mirrorInstagramMessage } = await import("@/lib/instagram/bridge.server");
        espelho = await mirrorInstagramMessage({
          igAccountRowId: account.id,
          igConversationId: conv.id,
          contactIgId: contactIgId,
          displayName: contatoNome ?? (contatoUser ? `@${contatoUser}` : null),
          username: contatoUser,
          profilePic: contatoFoto,
          direction: isFromMe ? "outbound" : "inbound",
          text: msg.message.text ?? null,
          messageType: msg.message.attachments?.[0]?.type ?? "text",
          attachmentUrl: msg.message.attachments?.[0]?.payload?.url ?? null,
          igMessageId: msg.message.mid ?? null,
          timestamp: msg.timestamp ?? null,
        });
      } catch (e) {
        console.error("[instagram] espelho no chat falhou:", (e as Error).message);
      }

      // IA responde as DMs com os mesmos agentes/regras do WhatsApp
      if (!isFromMe && espelho && iaAtiva) {
        try {
          const { runAgent } = await import("@/lib/whatsapp/agent-runner.server");

          await runAgent({
            wa_phone: espelho.waPhone,
            profile_name: contatoNome ?? contatoUser ?? null,
            trigger_message_id: msg.message.mid ?? undefined,
          });
        } catch (e) {
          console.error("[instagram] IA falhou:", (e as Error).message);
        }
      }
    }


    // ============ Comentários / Mentions ============
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" && change.field !== "mentions") continue;
      const v = change.value as {
        id?: string;
        text?: string;
        from?: { id: string; username?: string };
        media?: { id?: string; media_product_type?: string; media_url?: string };
        parent_id?: string;
        attachments?: { data?: Array<{ image_data?: { url?: string }; video_data?: { url?: string }; file_url?: string }> };
      };
      if (!v.id || !v.media?.id) continue;

      // Imagem/sticker anexado ao comentário, quando a Meta manda.
      const anexoComentario =
        v.attachments?.data?.[0]?.image_data?.url ??
        v.attachments?.data?.[0]?.video_data?.url ??
        v.attachments?.data?.[0]?.file_url ??
        null;


      // Contexto da publicação: legenda, tipo e miniatura — a IA precisa saber
      // de qual post veio o comentário.
      let midia: { caption: string | null; media_type: string | null; permalink: string | null; thumbnail: string | null; media_url?: string | null } = {
        caption: null, media_type: null, permalink: null, thumbnail: null, media_url: null,
      };
      if (igToken) {
        try {
          const { fetchMediaDetails } = await import("@/lib/instagram/api.server");
          midia = await fetchMediaDetails({ mediaId: v.media.id, token: igToken });
        } catch (e) {
          console.error("[instagram] dados da publicação falharam:", (e as Error).message);
        }
      }

      const { error: commentError } = await supabaseAdmin.from("instagram_comments").upsert(
        {
          account_id: account.id,
          media_id: v.media.id,
          comment_id: v.id,
          parent_comment_id: v.parent_id ?? null,
          from_ig_id: v.from?.id ?? null,
          from_username: v.from?.username ?? null,
          text: v.text ?? null,
          media_caption: midia.caption,
          media_thumbnail: midia.thumbnail,
          media_type: midia.media_type,
          media_permalink: midia.permalink,
          ...(anexoComentario ? { metadata: { attachment_url: anexoComentario } } : {}),


        },
        { onConflict: "comment_id" },
      );
      if (commentError) throw new Error(commentError.message);

      // Push pros atendentes: comentário/menção novo (não avisa dos meus próprios).
      const meuComentario = v.from?.id && (v.from.id === igAccountId || v.from.id === igApiUserId);
      if (!meuComentario) {
        try {
          const { notificarNovaMensagemChat } = await import("@/lib/chat/push.server");
          await notificarNovaMensagemChat({
            conversationId: v.media.id,
            titulo: `${v.from?.username ? "@" + v.from.username : "Instagram"} comentou`,
            corpo: v.text ?? "Novo comentário",
            canal: "instagram",
            messageId: v.id,
          });
        } catch (e) {
          console.error("[instagram] push comentário:", (e as Error).message);
        }
      }

      // Comentário é SEMPRE dos Consultores: resposta pública + convite no direct
      const souEu = v.from?.id && (v.from.id === igAccountId || v.from.id === igApiUserId);
      if (igToken && !souEu && iaPodeResponderComentario(igMetadata, midia.media_type)) {
        try {
          const { isAiGloballyOff } = await import("@/lib/whatsapp/ai-global-switch.server");
          if (!(await isAiGloballyOff())) {
            // Antes de responder, a IA assiste o vídeo (reels) pra entender o que foi falado.
            const { transcreverVideoDaPublicacao } = await import("@/lib/instagram/video-transcribe.server");
            const videoTranscricao = await transcreverVideoDaPublicacao({
              mediaId: v.media.id,
              mediaUrl: midia.media_url ?? null,
              mediaType: midia.media_type,
            });
            const { gerarRespostaComentario } = await import("@/lib/instagram/comment-ai.server");
            const resposta = await gerarRespostaComentario({
              fromUsername: v.from?.username ?? null,
              text: v.text ?? null,
              mediaCaption: midia.caption,
              mediaPermalink: midia.permalink,
              videoTranscricao,
            });
            if (resposta) {
              const { replyToComment } = await import("@/lib/instagram/api.server");
              await replyToComment({ commentId: v.id, token: igToken, message: resposta.publica });
              // O direct sai depois, com um respiro de 1min30 a 2min, pra não
              // parecer robô respondendo tudo no mesmo segundo. Quem envia é o
              // cron /api/public/hooks/instagram-dm-queue.
              const espera = 90_000 + Math.floor(Math.random() * 30_000);
              await supabaseAdmin
                .from("instagram_comments")
                .update({
                  auto_reply_status: "sent",
                  auto_reply_text: resposta.publica,
                  auto_replied_at: new Date().toISOString(),
                  dm_text: resposta.dm ?? null,
                  dm_scheduled_at: resposta.dm ? new Date(Date.now() + espera).toISOString() : null,
                })
                .eq("comment_id", v.id);
            }

          }
        } catch (e) {
          console.error("[instagram] IA de comentário falhou:", (e as Error).message);
        }
      }
    }
  }
}
