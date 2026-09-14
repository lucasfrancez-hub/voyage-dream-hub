/**
 * GET /api/public/internal/v1/health
 * Situação geral da API interna. Não expõe credencial nenhuma.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok } from "@/lib/api/auth.server";
import { API_VERSION } from "@/lib/api/respond";

export const Route = createFileRoute("/api/public/internal/v1/health")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApi(request, "flights:read", async (ctx) => {
          const { statusConexao } = await import("@/lib/integrations/oner/session.server");
          const { probeFlightSearch } = await import("@/lib/onertravel.server");

          // Pesquisa é anônima; sessão só vale para compra/pagamento.
          const buscaOk = await probeFlightSearch(ctx.correlationId).catch(() => false);

          let checkoutSession = "unknown";
          try {
            const s = await statusConexao();
            checkoutSession = s.status === "conectada" ? "active" : "inactive";
          } catch {
            checkoutSession = "unknown";
          }
          const asaas = process.env["ASAAS_API_KEY"] ? "configured" : "not_configured";
          return ok(
            {
              status: buscaOk ? "ok" : "degraded",
              version: API_VERSION,
              time: new Date().toISOString(),
              services: {
                oner: buscaOk ? "up" : "down",
                onerSearch: buscaOk ? "up" : "down",
                onerCheckoutSession: checkoutSession,
                asaas,
              },
            },
            ctx.correlationId,
          );
        }),

    },
  },
});
