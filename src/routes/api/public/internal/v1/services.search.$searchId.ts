/**
 * GET /api/public/internal/v1/services/search/{search_id}
 *
 * Estado da busca assíncrona de serviços. A Sky Hub monta o pacote com aéreo e
 * hotel e consulta este endpoint até o bloco `services` sair de "processing".
 * Falha aqui NÃO invalida aéreo, hotel nem o pacote.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

export const Route = createFileRoute("/api/public/internal/v1/services/search/$searchId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "services:read", async (ctx) => {
          try {
            const { estadoBuscaServicos } = await import("@/lib/services/async-search.server");
            const estado = await estadoBuscaServicos(String(params.searchId));
            if (!estado) {
              return fail("not_found", "Busca não encontrada ou expirada.", ctx.correlationId);
            }
            return ok(estado, ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
