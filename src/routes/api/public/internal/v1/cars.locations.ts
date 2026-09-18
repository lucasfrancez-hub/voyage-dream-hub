/**
 * POST /api/public/internal/v1/cars/locations
 *
 * Lojas/cidades de retirada e devolução de carro (Compre Fácil).
 * Sky Hub -> Internal API -> adapter -> operadora.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

export const Route = createFileRoute("/api/public/internal/v1/cars/locations")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "cars:read", async (ctx) => {
          const { carsLocationsInput, buscarLocaisCarro } = await import(
            "@/lib/cars/comprefacil-cars.server"
          );
          const parsed = carsLocationsInput.safeParse(ctx.body ?? {});
          if (!parsed.success) {
            return fail("invalid_request", "Informe um texto de busca válido.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          try {
            return ok(await buscarLocaisCarro(parsed.data), ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
