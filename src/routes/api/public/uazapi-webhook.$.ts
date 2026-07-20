import { createFileRoute } from "@tanstack/react-router";

/**
 * Splat do webhook UazAPI — quando "addUrlTypesMessages" está ligado no painel,
 * a URL vira /api/public/uazapi-webhook/text (ou /image, /audio, etc).
 * Aceita e delega pro mesmo processador.
 */
export const Route = createFileRoute("/api/public/uazapi-webhook/$")({
  server: {
    handlers: {
      GET: async () => new Response("uazapi webhook ok", { status: 200 }),
      POST: async ({ request }) => {
        const expected = process.env.UAZAPI_TOKEN;
        const got =
          request.headers.get("token") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (expected && got && got !== expected) {
          return new Response("Invalid token", { status: 401 });
        }
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        try {
          const { processUazPayload } = await import("@/lib/whatsapp/uazapi-webhook.server");
          await processUazPayload(payload);
        } catch (err) {
          console.error("[uazapi-webhook/*] erro:", err);
        }
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
