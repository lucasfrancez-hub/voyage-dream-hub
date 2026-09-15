/**
 * POST /api/public/internal/v1/packages/search
 *
 * Pacotes PRONTOS publicados no Command Center da VIA AIR. Fonte única:
 * tabela `packages`. Não consulta Cativa, Comprefácil nem catálogo bruto.
 *
 * Devolve status explícito (found / not_found / incompatible /
 * customization_required) para o orquestrador nunca fazer fallback silencioso.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

export const Route = createFileRoute("/api/public/internal/v1/packages/search")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "packages:read", async (ctx) => {
          const { readyPackagesInput, searchReadyPackages } = await import(
            "@/lib/packages/ready-packages.server"
          );
          const parsed = readyPackagesInput.safeParse(ctx.body ?? {});
          if (!parsed.success) {
            return fail("invalid_request", "Dados da busca inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          try {
            const resultado = await searchReadyPackages(parsed.data);
            return ok(resultado, ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
