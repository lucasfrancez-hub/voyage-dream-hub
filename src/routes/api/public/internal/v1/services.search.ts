/**
 * POST /api/public/internal/v1/services/search
 *
 * Serviços adicionais (transfer, passeio, ingresso, serviço genérico e seguro)
 * da aba Serviços do Compre Fácil. Sky Hub -> Internal API -> adapter -> CF.
 * A Sky Hub nunca fala com a operadora nem vê o formato bruto dela.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

export const Route = createFileRoute("/api/public/internal/v1/services/search")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "services:read", async (ctx) => {
          const { servicesSearchInput, buscarServicos } = await import(
            "@/lib/services/comprefacil-services.server"
          );
          const parsed = servicesSearchInput.safeParse(ctx.body ?? {});
          if (!parsed.success) {
            return fail("invalid_request", "Dados da busca inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          try {
            return ok(await buscarServicos(parsed.data, ctx.client.id), ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
