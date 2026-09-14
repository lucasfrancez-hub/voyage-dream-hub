/**
 * GET /api/public/internal/v1/oner/status
 * Situação da sessão do fornecedor. Nunca devolve token nem cookie.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/internal/v1/oner/status")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApi(request, "flights:read", async (ctx) => {
          try {
            const { statusConexao } = await import("@/lib/integrations/oner/session.server");
            const s = await statusConexao();
            return ok(
              {
                available: s.status === "conectada",
                session: s.status === "conectada" ? "active" : "inactive",
                lastValidatedAt: s.authenticatedAt,
                lastUsedAt: s.lastUsedAt,
                expiresAt: s.expiresAt,
                message:
                  s.status === "codigo_necessario"
                    ? "Aguardando código de acesso do fornecedor."
                    : s.status === "expirada"
                      ? "Sessão do fornecedor expirada."
                      : null,
              },
              ctx.correlationId,
            );
          } catch {
            return fail(
              "provider_unavailable",
              "Não foi possível verificar a sessão do fornecedor.",
              ctx.correlationId,
              { provider: "oner" },
            );
          }
        }),
    },
  },
});
