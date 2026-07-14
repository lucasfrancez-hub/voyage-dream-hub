import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Webhook do WhatsApp Cloud API (Meta).
 *
 * - GET  → verificação do webhook (hub.challenge). Meta chama uma única vez ao configurar.
 * - POST → recebimento de mensagens/status. Sempre responde 200 rápido (Meta reentrega se demorar).
 *
 * Segurança:
 *   - GET valida hub.verify_token contra WHATSAPP_VERIFY_TOKEN_USER
 *   - POST valida assinatura X-Hub-Signature-256 usando META_APP_SECRET
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
          console.error("[whatsapp-webhook] META_APP_SECRET não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }

        // Validação de assinatura HMAC-SHA256 (timing-safe)
        const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          console.warn("[whatsapp-webhook] assinatura inválida");
          return new Response("Invalid signature", { status: 401 });
        }

        // Payload verificado — processar de forma resiliente e responder 200 sempre.
        try {
          const payload = JSON.parse(raw);
          // TODO: persistir mensagens em tabela conversas/mensagens e disparar IA/roteamento.
          console.log("[whatsapp-webhook] payload recebido:", JSON.stringify(payload).slice(0, 500));
        } catch (err) {
          console.error("[whatsapp-webhook] erro ao processar:", err);
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
