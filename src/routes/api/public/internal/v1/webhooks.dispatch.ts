/**
 * POST /api/public/internal/v1/webhooks/dispatch
 * Dispara os avisos pendentes para quem consome a API (Sky Hub).
 * Uso interno: protegido por segredo próprio, não por token de cliente.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function confere(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/internal/v1/webhooks/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["VIAAIR_API_CRON_SECRET"] ?? "";
        const enviado = request.headers.get("x-viaair-cron") ?? "";
        if (!segredo || !enviado || !confere(segredo, enviado)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { despacharPendentes } = await import("@/lib/api/webhooks.server");
        const r = await despacharPendentes(25);
        return Response.json({ ok: true, ...r });
      },
    },
  },
});
