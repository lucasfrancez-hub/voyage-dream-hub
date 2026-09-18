/**
 * Recuperar uma seleção de serviço já persistida.
 *
 * GET  /api/public/internal/v1/services/selection?selecaoId=svcsel_...
 * POST /api/public/internal/v1/services/selection  { "selecaoId": "svcsel_..." }
 *
 * Devolve exatamente o mesmo contrato do /services/select (identificadores
 * preservados, referência do fornecedor sempre opaca). Não reserva nada.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

async function responder(request: Request, selecaoIdBruto: unknown) {
  return withApi(request, "services:read", async (ctx) => {
    const { servicesSelectionInput, recuperarSelecao } = await import(
      "@/lib/services/comprefacil-services.server"
    );
    const entrada =
      selecaoIdBruto === undefined
        ? (ctx.body ?? {})
        : { selecaoId: selecaoIdBruto };
    const parsed = servicesSelectionInput.safeParse(entrada);
    if (!parsed.success) {
      return fail("invalid_request", "Informe selecaoId válido.", ctx.correlationId, {
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    try {
      const r = await recuperarSelecao(parsed.data.selecaoId);
      if ("erro" in r) {
        return fail(
          "not_found",
          "Seleção não encontrada ou expirada.",
          ctx.correlationId,
        );
      }
      return ok(r, ctx.correlationId);
    } catch (e) {
      return failFromError(e, ctx.correlationId);
    }
  });
}

export const Route = createFileRoute("/api/public/internal/v1/services/selection")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        responder(request, new URL(request.url).searchParams.get("selecaoId") ?? ""),
      POST: async ({ request }) => responder(request, undefined),
    },
  },
});
