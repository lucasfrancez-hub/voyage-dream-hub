/**
 * POST /api/public/internal/v1/cars/search
 *
 * Locação de carro do Compre Fácil. A espera pelas locadoras acontece no
 * servidor; o Sky Hub recebe a lista já normalizada. Não reserva nada.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

export const Route = createFileRoute("/api/public/internal/v1/cars/search")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "cars:read", async (ctx) => {
          const { carsSearchInput, buscarCarros } = await import(
            "@/lib/cars/comprefacil-cars.server"
          );
          const parsed = carsSearchInput.safeParse(ctx.body ?? {});
          if (!parsed.success) {
            return fail("invalid_request", "Dados da busca inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          try {
            return ok(await buscarCarros(parsed.data, ctx.client.id), ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
