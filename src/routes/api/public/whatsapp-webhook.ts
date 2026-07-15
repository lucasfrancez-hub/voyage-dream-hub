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
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
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
  const { downloadWhatsAppMedia, transcribeAudio } = await import("@/lib/whatsapp/media.server");

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

        // Monta o conteúdo textual (texto direto OU transcrição de áudio OU resposta de botão)
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
          if (!transcript) {
            console.warn(`[wa-webhook] transcrição vazia pra ${msg.audio.id}`);
            continue;
          }
          content = `🎤 [áudio transcrito] ${transcript}`;
        } else {
          console.log(`[wa-webhook] tipo não suportado: ${msg.type}`);
          continue;
        }

        const conv = await getOrCreateConversation(msg.from, profileName);

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

        const saved = await saveMessage({
          conversation_id: conv.id,
          direction: "inbound",
          sender: "customer",
          content,
          wa_message_id: msg.id,
        });
        if (!saved) {
          console.log(`[wa-webhook] mensagem ${msg.id} já processada (dedupe)`);
          continue;
        }

        // Se foi resposta de botão do robô de voos, trata sem acionar a IA
        if (buttonReplyId && buttonReplyId.startsWith("flight_alert:")) {
          const { handleFlightAlertReply } = await import("@/lib/whatsapp/flight-alert-reply.server");
          await handleFlightAlertReply({ conversation_id: conv.id, wa_phone: msg.from, button_id: buttonReplyId });
          continue;
        }

        // Debounce: em vez de acionar a IA imediatamente, agenda pra daqui 3 min.
        // Toda mensagem nova empurra o horário pra frente — assim a IA responde
        // uma vez só, considerando tudo que o cliente mandou nesse intervalo.
        // Um cron a cada 30s (hook dispatch-ai-debounced) dispara quando vencer.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("wa_conversations")
          .update({ ai_debounce_until: new Date(Date.now() + 3 * 60 * 1000).toISOString() })
          .eq("id", conv.id);
      }

    }
  }
}
