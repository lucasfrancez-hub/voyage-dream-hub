import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do WhatsApp via UazAPI (canal do chatbot).
 *
 * Segurança: a UazAPI não assina o corpo, então exigimos um token secreto
 * (`?token=` ou header `x-uaz-token`) igual a UAZAPI_WEBHOOK_TOKEN.
 */
export const Route = createFileRoute("/api/public/uazapi-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),

      POST: async ({ request }) => {
        const esperado = process.env.UAZAPI_WEBHOOK_TOKEN;
        if (!esperado) {
          console.error("[uaz-webhook] UAZAPI_WEBHOOK_TOKEN não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }
        const url = new URL(request.url);
        const recebido = url.searchParams.get("token") ?? request.headers.get("x-uaz-token") ?? "";
        if (recebido !== esperado) return new Response("Invalid token", { status: 401 });

        let payload: unknown = null;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        try {
          await processarEvento(payload);
        } catch (err) {
          console.error("[uaz-webhook] erro processando:", err);
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});

async function processarEvento(payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, unknown>;

  const tipoEvento = String(p.EventType ?? p.event ?? p.type ?? "").toLowerCase();
  if (tipoEvento && !tipoEvento.includes("message")) return; // presença, conexão, etc.

  const brutas: unknown[] = Array.isArray(p.messages)
    ? (p.messages as unknown[])
    : p.message
      ? [p.message]
      : Array.isArray(p.data)
        ? (p.data as unknown[])
        : [p];

  const { normalizeUazMessage } = await import("@/lib/whatsapp/uaz-channel.server");
  const { ingestUazMessage } = await import("@/lib/whatsapp/uaz-ingest.server");

  for (const bruta of brutas) {
    const msg = normalizeUazMessage(bruta);
    if (!msg) continue;
    const resultado = await ingestUazMessage(msg);
    console.log(
      JSON.stringify({ event: "uaz_inbound", wa_message_id: msg.id, tipo: msg.type, resultado }),
    );
  }
}
