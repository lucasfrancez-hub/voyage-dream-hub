/**
 * Recuperar uma seleção de carro já persistida.
 *
 * GET  /api/public/internal/v1/cars/selection?selecaoId=carsel_...
 * POST /api/public/internal/v1/cars/selection  { "selecaoId": "carsel_..." }
 *
 * Mesmo contrato do /cars/select. Referência do fornecedor sempre opaca.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

async function responder(request: Request, selecaoIdBruto: unknown) {
  return withApi(request, "cars:read", async (ctx) => {
    const { carsSelectionInput, recuperarSelecaoCarro } = await import(
      "@/lib/cars/comprefacil-cars.server"
    );
    const entrada = selecaoIdBruto === undefined ? (ctx.body ?? {}) : { selecaoId: selecaoIdBruto };
    const parsed = carsSelectionInput.safeParse(entrada);
    if (!parsed.success) {
      return fail("invalid_request", "Informe selecaoId válido.", ctx.correlationId, {
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    try {
      const r = await recuperarSelecaoCarro(parsed.data.selecaoId);
      if ("erro" in r) {
        return fail("not_found", "Seleção não encontrada ou expirada.", ctx.correlationId);
      }
      return ok(r, ctx.correlationId);
    } catch (e) {
      return failFromError(e, ctx.correlationId);
    }
  });
}

export const Route = createFileRoute("/api/public/internal/v1/cars/selection")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        responder(request, new URL(request.url).searchParams.get("selecaoId") ?? ""),
      POST: async ({ request }) => responder(request, undefined),
    },
  },
});
