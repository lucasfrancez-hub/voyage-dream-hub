/**
 * Acompanhamento agendado das operações da Comprar Viagem.
 * Protegido por segredo (`x-oner-secret` ou `?token=`).
 */
import { createFileRoute } from "@tanstack/react-router";

async function executar(request: Request) {
  const url = new URL(request.url);
  const segredo = process.env["ONER_SYNC_SECRET"] ?? process.env["ONER_OTP_INBOX_SECRET"];
  const enviado = request.headers.get("x-oner-secret") ?? url.searchParams.get("token") ?? "";
  if (!segredo || enviado !== segredo) return new Response("unauthorized", { status: 401 });

  const { sincronizarPendentes } = await import("@/lib/integrations/oner/sync.server");
  const limite = Math.min(25, Math.max(1, Number(url.searchParams.get("limite") ?? 10) || 10));
  const r = await sincronizarPendentes(limite);
  return Response.json(r);
}

export const Route = createFileRoute("/api/public/oner-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => executar(request),
      GET: async ({ request }) => executar(request),
    },
  },
});
