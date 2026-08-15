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
        statuses?: Array<{
          id: string;
          status: string;
          timestamp?: string;
          recipient_id: string;
          errors?: Array<{
            code?: number;
            title?: string;
            message?: string;
            error_data?: { details?: string };
          }>;
        }>;
      };
    }>;
  }>;
};

/**
 * Registra no banco o evento bruto recebido da Meta (sanitizado pela própria
 * Meta — não contém credenciais). Serve de evidência: prova se o evento de
 * revogação chegou, qual id veio e se a mensagem original foi localizada.
 */
async function logWebhookEvent(
  admin: unknown,
  ev: {
    event_type: string;
    meta_message_id?: string | null;
    wa_from?: string | null;
    conversation_id?: string | null;
    matched_message_id?: string | null;
    note?: string | null;
    payload?: Record<string, unknown> | null;
  },
) {
  type Insertable = {
    from: (t: string) => { insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
  };
  try {
    const { error } = await (admin as Insertable).from("wa_webhook_events").insert({

      webhook_field: "messages",
      event_type: ev.event_type,
      meta_message_id: ev.meta_message_id ?? null,
      wa_from: ev.wa_from ?? null,
      conversation_id: ev.conversation_id ?? null,
      matched_message_id: ev.matched_message_id ?? null,
      note: ev.note ?? null,
      payload: ev.payload ?? null,
    });
    if (error) console.error("[wa-webhook] log de evento falhou:", error.message);
  } catch (e) {
    console.error("[wa-webhook] log de evento falhou:", e);
  }
}

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
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const failure = st.errors?.[0];
          const details = failure?.error_data?.details;
          const message =
            details ?? failure?.message ?? failure?.title ?? "O WhatsApp não entregou a mensagem";
          const code = failure?.code ? `Meta ${failure.code}: ` : "";

          // STATUS REAL: sent ≠ delivered ≠ read. "Aceito pela Meta" não é entrega.
          const conhecido = ["sent", "delivered", "read", "failed"].includes(st.status);
          const quando = st.timestamp
            ? new Date(Number(st.timestamp) * 1000).toISOString()
            : new Date().toISOString();
          const patch: Record<string, unknown> = conhecido
            ? { delivery_status: st.status, delivery_status_at: quando }
            : {};
          if (st.status === "delivered") patch.delivered_at = quando;
          if (st.status === "read") {
            patch.read_at = quando;
            patch.delivered_at = quando; // lida implica entregue (Meta pode pular o delivered)
          }
          if (st.status === "failed") patch.error = `${code}${message}`;
          if (Object.keys(patch).length) {
            // Nunca regride o status: read > delivered > sent.
            const { data: atual } = await supabaseAdmin
              .from("wa_messages")
              .select("delivery_status, delivered_at, read_at")
              .eq("wa_message_id", st.id)
              .maybeSingle();
            const peso: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
            const anterior = (atual as { delivery_status?: string | null } | null)?.delivery_status ?? null;
            if (anterior && conhecido && st.status !== "failed" && (peso[anterior] ?? 0) > (peso[st.status] ?? 0)) {
              delete patch.delivery_status;
              delete patch.delivery_status_at;
            }
            if ((atual as { delivered_at?: string | null } | null)?.delivered_at) delete patch.delivered_at;
            if ((atual as { read_at?: string | null } | null)?.read_at) delete patch.read_at;
            if (Object.keys(patch).length) {
              const { error } = await supabaseAdmin
                .from("wa_messages")
                .update(patch as never)
                .eq("wa_message_id", st.id);
              if (error) console.error("[wa-webhook] falha ao registrar status:", error.message);
            }
          }

          // Se a mensagem era uma ARTE de voo, o status real entra no log dos cards.
          try {
            const { data: msg } = await supabaseAdmin
              .from("wa_messages")
              .select("conversation_id, content")
              .eq("wa_message_id", st.id)
              .maybeSingle();
            const ehCard = /\[\[media:image/i.test(
              (msg as { content?: string | null } | null)?.content ?? "",
            );
            if (ehCard && conhecido) {
              const { logCardEvent } = await import("@/lib/whatsapp/card-log.server");
              logCardEvent({
                event: st.status === "failed" ? "card_failed" : "card_status",
                conversation_id: (msg as { conversation_id?: string | null }).conversation_id ?? null,
                meta_message_id: st.id,
                delivery_status: st.status as "sent" | "delivered" | "read" | "failed",
                ...(st.status === "failed"
                  ? { failed_stage: "meta_delivery" as const, failure_reason: `${code}${message}` }
                  : {}),
              });
            }
          } catch (e) {
            console.warn("[wa-webhook] log de status do card falhou:", e);
          }
        }
      }


      for (const msg of value.messages ?? []) {
        const profileName =
          value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;

        // --- DELEÇÃO ("apagar para todos") ---
        // A Meta manda o evento no MESMO endpoint das mensagens, com
        // type=unsupported (+ errors[131051]). O `id` costuma ser o id da
        // mensagem original; em alguns casos vem em `context.id`.
        // Detecção tolerante: qualquer `unsupported` é tratado como candidato
        // a revogação — se não achar a mensagem, fica registrado como falha.
        const isUnsupported = msg.type === "unsupported";
        const isRevokeType = /revok|deleted|delete/i.test(msg.type ?? "");
        if (isUnsupported || isRevokeType) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Horário informado pela Meta no evento (epoch em segundos), com fallback pro agora.
          const revokedAt = (() => {
            const ts = Number(msg.timestamp);
            return Number.isFinite(ts) && ts > 0
              ? new Date(ts * 1000).toISOString()
              : new Date().toISOString();
          })();

          // Todos os ids que a Meta pode ter usado pra apontar a mensagem original.
          const candidatos = [msg.id, msg.context?.id].filter(
            (v): v is string => typeof v === "string" && v.length > 0,
          );

          const { data: alvo } = candidatos.length
            ? await supabaseAdmin
                .from("wa_messages")
                .select("id, conversation_id, is_revoked, wa_message_id")
                .in("wa_message_id", candidatos)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            : { data: null };

          if (!alvo) {
            // Não pode falhar em silêncio: fica gravado o payload real.
            console.error(
              JSON.stringify({
                event: "message_revoke_target_not_found",
                revoke_target_meta_id: msg.id,
                context_id: msg.context?.id ?? null,
                wa_from: msg.from,
                received_at: revokedAt,
              }),
            );
            await logWebhookEvent(supabaseAdmin, {
              event_type: "message_revoke_target_not_found",
              meta_message_id: msg.id,
              wa_from: msg.from,
              note: `type=${msg.type} errors=${JSON.stringify(msg.errors ?? [])}`,
              payload: msg as unknown as Record<string, unknown>,
            });
            continue;
          }

          if (alvo.is_revoked) {
            // Evento duplicado: não regrava, não duplica log de revogação.
            await logWebhookEvent(supabaseAdmin, {
              event_type: "message_revoke_duplicate",
              meta_message_id: msg.id,
              wa_from: msg.from,
              conversation_id: alvo.conversation_id,
              matched_message_id: alvo.id,
            });
            continue;
          }

          const { data: updated, error: upErr } = await supabaseAdmin
            .from("wa_messages")
            .update({
              is_revoked: true,
              revoked_by: "customer",
              revoked_at: revokedAt,
              deleted_at: revokedAt,
              deleted_by_customer: true,
            })
            .eq("id", alvo.id)
            .select("id, conversation_id, is_revoked, revoked_at, revoked_by")
            .maybeSingle();

          if (upErr || !updated) {
            console.error("[wa-webhook] falha ao marcar revogação:", upErr?.message);
            await logWebhookEvent(supabaseAdmin, {
              event_type: "message_revoke_update_failed",
              meta_message_id: msg.id,
              wa_from: msg.from,
              conversation_id: alvo.conversation_id,
              matched_message_id: alvo.id,
              note: upErr?.message ?? "update não retornou registro",
              payload: msg as unknown as Record<string, unknown>,
            });
            continue;
          }

          console.log(
            JSON.stringify({
              event: "message_revoked",
              conversation_id: updated.conversation_id,
              message_id: updated.id,
              meta_message_id: alvo.wa_message_id,
              is_revoked: updated.is_revoked,
              revoked_by: updated.revoked_by,
              revoked_at: updated.revoked_at,
            }),
          );
          await logWebhookEvent(supabaseAdmin, {
            event_type: "message_revoked",
            meta_message_id: alvo.wa_message_id ?? msg.id,
            wa_from: msg.from,
            conversation_id: updated.conversation_id,
            matched_message_id: updated.id,
            note: `revoked_at=${updated.revoked_at}`,
            payload: msg as unknown as Record<string, unknown>,
          });

          // Realtime: o UPDATE na wa_messages já é publicado em
          // supabase_realtime, e o painel escuta UPDATE por conversation_id.
          // Um toque na conversa garante que a lista também se atualize.
          await supabaseAdmin
            .from("wa_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", updated.conversation_id);
          continue;
        }


        const conv = await getOrCreateConversation(msg.from, profileName);

        // Monta o conteúdo (texto, botão, mídia com marcador [[media:...]] ou transcrição de áudio)
        let content: string | null = null;
        let buttonReplyId: string | null = null;
        let inboundTranscript: string | null = null;

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
          inboundTranscript = transcript ?? null;

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

          // ANÁLISE MULTIMODAL — infraestrutura comum a TODOS os agentes.
          // Roda na ingestão, antes de qualquer agente responder, e a leitura
          // vira parte do conteúdo da mensagem (memória do protocolo).
          let analiseBloco = "";
          const { analyzeImage, isAnalyzableImage, buildAnalysisBlock } = await import(
            "@/lib/whatsapp/image-vision.server"
          );
          if (isAnalyzableImage(media.mimeType)) {
            console.log(
              JSON.stringify({
                event: "image_received",
                conversation_id: conv.id,
                from: msg.from,
                media_id: part.id,
                mime_type: media.mimeType,
                bytes: media.blob.size,
                at: new Date().toISOString(),
              }),
            );
            const analysis = await analyzeImage({
              blob: media.blob,
              mimeType: media.mimeType,
              caption,
              conversationId: conv.id,
            });
            analiseBloco = `\n${buildAnalysisBlock(analysis)}`;
          }

          if (!stored) {
            const label = caption || `📎 [${msg.type} recebido — falha ao salvar]`;
            content = `${label}${analiseBloco}`;
          } else {
            const label = kind === "image" ? "🖼️ [imagem recebida]" : kind === "video" ? "🎬 [vídeo recebido]" : "📎 [documento recebido]";
            content = `[[media:${kind}|${stored.url}|${stored.filename}]]\n${caption || label}${analiseBloco}`;
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

        // Se a mensagem é uma resposta (reply nativo), resolve a mensagem citada.
        // NUNCA chutar a última mensagem da conversa: se não achar, registramos
        // reply_context_not_found e a IA pede confirmação quando precisar.
        let replySnippet: string | null = null;
        let replySender: string | null = null;
        let replyToMessageId: string | null = null;
        const replyToId = msg.context?.id ?? null;
        if (replyToId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: quoted } = await supabaseAdmin
            .from("wa_messages")
            .select("id, content, direction, sender")
            .eq("wa_message_id", replyToId)
            .maybeSingle();
          if (quoted) {
            replyToMessageId = quoted.id as string;
            replySnippet = previewFromContent(String(quoted.content ?? ""));
            replySender = quoted.direction === "outbound" ? "me" : (quoted.sender ?? "customer");
          } else {
            const isFromUs = !!msg.context?.from && msg.context.from !== msg.from;
            replySender = isFromUs ? "me" : "customer";
            console.log(
              JSON.stringify({
                event: "reply_context_not_found",
                conversation_id: conv.id,
                reply_to_wa_id: replyToId,
                from: msg.from,
                at: new Date().toISOString(),
              }),
            );
          }
        }

        const inboundType =
          msg.type === "audio" || msg.type === "voice"
            ? "audio"
            : msg.type === "image" || msg.type === "sticker"
              ? "image"
              : msg.type === "video"
                ? "video"
                : msg.type === "document"
                  ? "document"
                  : msg.type === "interactive"
                    ? "button"
                    : "text";

        const saved = await saveMessage({
          conversation_id: conv.id,
          direction: "inbound",
          sender: "customer",
          content,
          wa_message_id: msg.id,
          reply_to_wa_id: replyToId,
          reply_to_message_id: replyToMessageId,
          reply_to_snippet: replySnippet,
          reply_to_sender: replySender,
          message_type: inboundType,
          transcricao: inboundTranscript,
        });

        if (!saved) {
          console.log(`[wa-webhook] mensagem ${msg.id} já processada (dedupe)`);
          continue;
        }

        // O cliente respondeu → janela de 24h da Meta reabriu.
        // Reenvia automaticamente tudo que ficou preso por 131047.
        try {
          const { liberarFilaDaJanela } = await import("@/lib/whatsapp/janela-24h.server");
          await liberarFilaDaJanela(conv.id, msg.from);
        } catch (err) {
          console.error("[wa-webhook] falha ao liberar fila da janela:", err);
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
        // - Resposta curta ou rajada (2+ mensagens em menos de 30s) → 60s;
        //   o dispatcher ainda
        //   adia enquanto o cliente continuar digitando (guarda de 25s).
        // - Janela já aberta com mensagem longa → 120s
        // - 1ª mensagem depois de um silêncio → 90s
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
        const respostaCurta = content.replace(/\[\[media:[^\]]+\]\]/g, "").trim().length <= 40;
        if (respostaCurta || (recentBurst ?? 0) >= 2) {
          waitMs = 60 * 1000; // resposta curta/rajada → cerca de 1min
        } else if (convState?.ai_debounce_until) {
          waitMs = 120 * 1000; // janela já aberta → follow-up
        } else {
          waitMs = 90 * 1000; // mensagem isolada após silêncio
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

        // NÃO PISAR EM EXECUÇÃO ATIVA: o dispatcher marca um lease de 5 min em
        // `ai_debounce_until` enquanto o runAgent processa, e a transferência
        // humana agenda no máximo 3 min. Qualquer valor acima desse teto é
        // lease em andamento — sobrescrever liberava um segundo runAgent
        // simultâneo para a mesma conversa (respostas e perguntas repetidas).
        const TETO_AGENDAMENTO_MS = 200 * 1000;
        const atual = convState?.ai_debounce_until
          ? new Date(convState.ai_debounce_until as string).getTime()
          : 0;
        const leaseAtivo = atual > Date.now() + TETO_AGENDAMENTO_MS;
        if (!leaseAtivo) {
          await supabaseAdmin
            .from("wa_conversations")
            .update({ ai_debounce_until: new Date(finalAt).toISOString() })
            .eq("id", conv.id);
        } else {
          console.log("[wa-webhook] run em andamento; debounce preservado", conv.id);
        }


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
