/**
 * GET /api/public/internal/v1/oner/status
 *
 * Duas coisas diferentes, agora separadas:
 *  - pesquisa de voos: não depende de login (mesmo caminho usado pelo portal);
 *  - sessão de compra: conta operacional VIA AIR, usada só no checkout.
 *
 * Antes o endpoint reportava "indisponível" quando só a sessão de compra
 * estava vencida, mesmo com a pesquisa funcionando. Nunca devolve token nem
 * cookie.
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
            const { searchAirports } = await import("@/lib/onertravel.server");

            const [s, buscaOk] = await Promise.all([
              statusConexao(),
              searchAirports({ query: "GRU", isDeparture: true })
                .then((l) => l.length > 0)
                .catch(() => false),
            ]);

            const sessaoAtiva = s.status === "conectada";
            const mensagemSessao =
              s.status === "codigo_necessario"
                ? "Aguardando código de acesso do fornecedor."
                : s.status === "expirada"
                  ? "Sessão de compra do fornecedor expirada (não afeta a pesquisa)."
                  : null;

            return ok(
              {
                // Pesquisa disponível = API consegue pesquisar, igual ao portal.
                available: buscaOk,
                searchAvailable: buscaOk,
                session: sessaoAtiva ? "active" : "inactive",
                checkoutSession: {
                  status: sessaoAtiva ? "active" : "inactive",
                  lastValidatedAt: s.authenticatedAt,
                  lastUsedAt: s.lastUsedAt,
                  expiresAt: s.expiresAt,
                  message: mensagemSessao,
                },
                lastValidatedAt: s.authenticatedAt,
                lastUsedAt: s.lastUsedAt,
                expiresAt: s.expiresAt,
                message: buscaOk
                  ? mensagemSessao
                  : "O motor de pesquisa do fornecedor está indisponível no momento.",
              },
              ctx.correlationId,
            );
          } catch {
            return fail(
              "provider_unavailable",
              "Não foi possível verificar a situação do fornecedor.",
              ctx.correlationId,
              { provider: "oner" },
            );
          }
        }),
    },
  },
});

