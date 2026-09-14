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
          let oner = "unknown";
          try {
            const s = await statusConexao();
            oner = s.conectado ? "up" : "degraded";
          } catch {
            oner = "down";
          }
          const asaas = process.env["ASAAS_API_KEY"] ? "configured" : "not_configured";
          return ok(
            {
              status: oner === "up" ? "ok" : "degraded",
              version: API_VERSION,
              time: new Date().toISOString(),
              services: { oner, asaas },
            },
            ctx.correlationId,
          );
        }),
    },
  },
});
