import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Webhook do WhatsApp Cloud API (Meta).
 *
 * - GET  → verificação do webhook (hub.challenge).
 * - POST → recebe mensagens/status. Valida assinatura, persiste e aciona a Camila.
 */
export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WHATSAPP_VERIFY_TOKEN_USER;
        if (mode === "subscribe" && token && expected && token === expected) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-hub-signature-256") ?? "";
        const appSecret = process.env.META_APP_SECRET;
        if (!appSecret) {
          console.error("[wa-webhook] META_APP_SECRET não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }

        const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          console.warn("[wa-webhook] assinatura inválida");
          return new Response("Invalid signature", { status: 401 });
        }

        // Processa fora do fluxo síncrono pra devolver 200 rápido pra Meta
        try {
          const payload = JSON.parse(raw) as WhatsAppPayload;
          await processPayload(payload);
        } catch (err) {
          console.error("[wa-webhook] erro processando:", err);
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});

// --------- Payload types (subset relevante) ---------
type WhatsAppPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          audio?: { id: string; mime_type?: string; voice?: boolean };
          image?: { id: string; mime_type?: string; caption?: string; sha256?: string };
          video?: { id: string; mime_type?: string; caption?: string };
          sticker?: { id: string; mime_type?: string };
          document?: { id: string; mime_type?: string; caption?: string; filename?: string };
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
          // Meta envia isso quando a mensagem é uma resposta (reply) a outra
          context?: {
            from?: string;
            id?: string;
            forwarded?: boolean;
          };
          // Meta sinaliza "apagar para todos" com type=unsupported + errors[code=131051]
          errors?: Array<{ code?: number; title?: string; message?: string }>;
          timestamp?: string;
        }>;
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
        statuses?: Array<{ id: string; status: string; recipient_id: string }>;
      };
    }>;
  }>;
};

async function processPayload(payload: WhatsAppPayload) {
  const { getOrCreateConversation, saveMessage } = await import("@/lib/whatsapp/conversation.server");
  const { runAgent } = await import("@/lib/whatsapp/agent-runner.server");
  const { downloadWhatsAppMedia, transcribeAudio, storeInboundMedia, extFromMime } = await import("@/lib/whatsapp/media.server");

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      if (value.statuses) {
        for (const st of value.statuses) {
          console.log(`[wa-webhook] status ${st.status} para ${st.id}`);
        }
      }

      for (const msg of value.messages ?? []) {
        const profileName =
          value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;

        // --- DELEÇÃO ("apagar para todos") ---
        // Meta sinaliza como type=unsupported + errors[code=131051].
        // O `id` recebido aqui É o id da mensagem que foi apagada.
        const isRevoke =
          msg.type === "unsupported" &&
          Array.isArray(msg.errors) &&
          msg.errors.some((e) => e?.code === 131051);
        if (isRevoke) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: updated } = await supabaseAdmin
            .from("wa_messages")
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by_customer: true,
            })
            .eq("wa_message_id", msg.id)
            .select("id")
            .maybeSingle();
          console.log(
            `[wa-webhook] REVOKE Meta ${msg.id} — ${updated ? "marcada" : "não encontrada"}`,
          );
          continue;
        }

        const conv = await getOrCreateConversation(msg.from, profileName);

        // Monta o conteúdo (texto, botão, mídia com marcador [[media:...]] ou transcrição de áudio)
        let content: string | null = null;
        let buttonReplyId: string | null = null;
        if (msg.type === "text" && msg.text?.body) {
          content = msg.text.body;
        } else if (msg.type === "interactive" && msg.interactive?.button_reply) {
          buttonReplyId = msg.interactive.button_reply.id;
          content = msg.interactive.button_reply.title;
        } else if ((msg.type === "audio" || msg.type === "voice") && msg.audio?.id) {
          console.log(`[wa-webhook] baixando áudio ${msg.audio.id} de ${msg.from}`);
          const media = await downloadWhatsAppMedia(msg.audio.id);
          if (!media) {
            console.warn(`[wa-webhook] falha ao baixar áudio ${msg.audio.id}`);
            continue;
          }
          const transcript = await transcribeAudio(media.blob, media.mimeType);
          const stored = await storeInboundMedia({
            conversationId: conv.id,
            blob: media.blob,
            mimeType: media.mimeType,
            filename: `audio-${msg.audio.id}.${extFromMime(media.mimeType)}`,
          });
          const texto = transcript ? `🎤 [áudio transcrito] ${transcript}` : "🎤 [áudio recebido]";
          content = stored
            ? `[[media:audio|${stored.url}|${stored.filename}]]\n${texto}`
            : texto;
        } else if (
          (msg.type === "image" && msg.image?.id) ||
          (msg.type === "sticker" && msg.sticker?.id) ||
          (msg.type === "video" && msg.video?.id) ||
          (msg.type === "document" && msg.document?.id)
        ) {
          const part =
            msg.type === "image" ? msg.image! :
            msg.type === "sticker" ? msg.sticker! :
            msg.type === "video" ? msg.video! : msg.document!;
          const kind = msg.type === "document" ? "document" : msg.type === "video" ? "video" : "image";
          console.log(`[wa-webhook] baixando ${msg.type} ${part.id} de ${msg.from}`);
          const media = await downloadWhatsAppMedia(part.id);
          if (!media) {
            console.warn(`[wa-webhook] falha ao baixar ${msg.type} ${part.id}`);
            continue;
          }
          const fallbackName =
            (msg.type === "document" ? msg.document?.filename : null) ??
            `${msg.type}-${part.id}.${extFromMime(media.mimeType)}`;
          const stored = await storeInboundMedia({
            conversationId: conv.id,
            blob: media.blob,
            mimeType: media.mimeType,
            filename: fallbackName,
          });
          const caption =
            (msg.type === "image" ? msg.image?.caption : msg.type === "video" ? msg.video?.caption : msg.document?.caption) ?? "";
          if (!stored) {
            content = caption || `📎 [${msg.type} recebido — falha ao salvar]`;
          } else {
            const label = kind === "image" ? "🖼️ [imagem recebida]" : kind === "video" ? "🎬 [vídeo recebido]" : "📎 [documento recebido]";
            content = `[[media:${kind}|${stored.url}|${stored.filename}]]\n${caption || label}`;
          }
        } else {
          console.log(`[wa-webhook] tipo não suportado: ${msg.type}`);
          continue;
        }



        // Se a conversa foi encerrada manualmente, uma nova mensagem = novo lead:
        // volta o modo para IA e reseta a etapa do funil para "novo".
        if (conv.mode === "resolved") {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("wa_conversations")
            .update({ mode: "ai", funnel_stage: "novo", assigned_to: null })
            .eq("id", conv.id);
          conv.mode = "ai";
        }

        // Se a mensagem é uma resposta (reply nativo), busca o snippet da mensagem citada
        let replySnippet: string | null = null;
        let replySender: string | null = null;
        const replyToId = msg.context?.id ?? null;
        if (replyToId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: quoted } = await supabaseAdmin
            .from("wa_messages")
            .select("content, direction, sender")
            .eq("wa_message_id", replyToId)
            .maybeSingle();
          if (quoted) {
            replySnippet = previewFromContent(String(quoted.content ?? ""));
            replySender = quoted.direction === "outbound" ? "me" : (quoted.sender ?? "customer");
          } else {
            // Não achamos a original pelo id (ex.: envio antigo sem wa_message_id gravado,
            // ou mensagem enviada direto do celular). Fallback: pega a última mensagem
            // da conversa (últimas 24h) que ainda está sem id — quase sempre é essa
            // que o cliente citou — pra o preview não ficar só "mensagem".
            const isFromUs = !!msg.context?.from && msg.context.from !== msg.from;
            replySender = isFromUs ? "me" : "customer";
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: guess } = await supabaseAdmin
              .from("wa_messages")
              .select("content, direction, sender")
              .eq("conversation_id", conv.id)
              .eq("direction", isFromUs ? "outbound" : "inbound")
              .is("wa_message_id", null)
              .is("deleted_at", null)
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (guess) {
              replySnippet = previewFromContent(String(guess.content ?? ""));
              replySender = guess.direction === "outbound" ? "me" : (guess.sender ?? "customer");
            }
          }

        }


        const saved = await saveMessage({
          conversation_id: conv.id,
          direction: "inbound",
          sender: "customer",
          content,
          wa_message_id: msg.id,
          reply_to_wa_id: replyToId,
          reply_to_snippet: replySnippet,
          reply_to_sender: replySender,
        });
        if (!saved) {
          console.log(`[wa-webhook] mensagem ${msg.id} já processada (dedupe)`);
          continue;
        }

        // Se foi resposta de botão do robô de voos (via id interativo), trata sem IA
        if (buttonReplyId && buttonReplyId.startsWith("flight_alert:")) {
          const { handleFlightAlertReply } = await import("@/lib/whatsapp/flight-alert-reply.server");
          await handleFlightAlertReply({ conversation_id: conv.id, wa_phone: msg.from, button_id: buttonReplyId });
          continue;
        }

        // Fallback: alguns clientes devolvem só o TÍTULO do botão como texto puro.
        // Casa pelo título e usa o alerta pendente mais recente pra esse telefone.
        {
          const { matchFlightAlertButton } = await import("@/lib/whatsapp/flight-alert-match");
          const buttonAction = matchFlightAlertButton(content);
          if (buttonAction) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const phoneDigits = msg.from.replace(/\D/g, "");
            const variants = new Set<string>([phoneDigits]);
            // BR mobile: tenta com e sem o 9 depois do DDD
            if (phoneDigits.startsWith("55") && phoneDigits.length === 13) {
              variants.add(phoneDigits.slice(0, 4) + phoneDigits.slice(5));
            } else if (phoneDigits.startsWith("55") && phoneDigits.length === 12) {
              variants.add(phoneDigits.slice(0, 4) + "9" + phoneDigits.slice(4));
            }
            const { data: pending } = await supabaseAdmin
              .from("flight_change_alerts")
              .select("id")
              .in("wa_phone", Array.from(variants))
              .is("response", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (pending?.id) {
              const { handleFlightAlertReply } = await import("@/lib/whatsapp/flight-alert-reply.server");
              await handleFlightAlertReply({
                conversation_id: conv.id,
                wa_phone: msg.from,
                button_id: `flight_alert:${pending.id}:${buttonAction}`,
              });
              continue;
            }
          }
        }

        // Debounce ADAPTATIVO: agenda a resposta da IA pra daqui X segundos.
        // - Se o cliente mandou 2+ mensagens em menos de 30s (rajada) → 4 min
        // - Se já existe uma janela de debounce aberta (mid-conversa) → 3 min
        // - Se é a 1ª mensagem depois de um silêncio → 90s (responde mais rápido)
        // Toda mensagem nova recalcula e empurra o horário. Um cron a cada 30s
        // (hook dispatch-ai-debounced) dispara quando vencer.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: convState } = await supabaseAdmin
          .from("wa_conversations")
          .select("ai_debounce_until")
          .eq("id", conv.id)
          .maybeSingle();

        const thirtySecAgo = new Date(Date.now() - 30 * 1000).toISOString();
        const { count: recentBurst } = await supabaseAdmin
          .from("wa_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("direction", "inbound")
          .gte("created_at", thirtySecAgo);

        let waitMs: number;
        if ((recentBurst ?? 0) >= 2) {
          waitMs = 3 * 60 * 1000; // rajada → cap de 3min (máx. inicial)
        } else if (convState?.ai_debounce_until) {
          waitMs = 2 * 60 * 1000; // janela já aberta → follow-up mais curto
        } else {
          waitMs = 90 * 1000; // mensagem isolada após silêncio → responde rápido
        }

        // CAP ABSOLUTO: nunca deixar a IA demorar mais que 3min a contar da
        // PRIMEIRA mensagem não respondida do cliente. Se novas mensagens
        // continuarem chegando, elas NÃO podem empurrar o deadline pra além
        // desse teto.
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

        await supabaseAdmin
          .from("wa_conversations")
          .update({ ai_debounce_until: new Date(finalAt).toISOString() })
          .eq("id", conv.id);

      }

    }
  }
}

/** Transforma o conteúdo salvo (com marcadores de mídia) num preview legível. */
function previewFromContent(raw: string): string | null {
  if (!raw) return null;
  let text = raw;
  const media = raw.match(/^\[\[media:([a-z]+)\|[^\]]*\]\]\n?/);
  if (media) {
    text = raw.replace(media[0], "").trim();
    if (!text) {
      const kind = media[1];
      return kind === "image" ? "🖼️ Foto"
        : kind === "video" ? "🎬 Vídeo"
        : kind === "audio" ? "🎤 Áudio"
        : "📎 Documento";
    }
  }
  text = text.replace(/^\*[^*\n]{1,40}:\*\n?/, "").trim();
  return text ? text.slice(0, 160) : null;
}
