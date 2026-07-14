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
        if (msg.type !== "text" || !msg.text?.body) {
          console.log(`[wa-webhook] tipo não suportado: ${msg.type}`);
          continue;
        }
        const profileName =
          value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;

        const conv = await getOrCreateConversation(msg.from, profileName);
        const saved = await saveMessage({
          conversation_id: conv.id,
          direction: "inbound",
          sender: "customer",
          content: msg.text.body,
          wa_message_id: msg.id,
        });
        if (!saved) {
          console.log(`[wa-webhook] mensagem ${msg.id} já processada (dedupe)`);
          continue;
        }

        await runAgent({ wa_phone: msg.from, profile_name: profileName });
      }
    }
  }
}
