/**
 * POST /api/public/internal/v1/cars/select
 *
 * Persiste a escolha de um carro (com ou sem proteções), guardando no servidor
 * os identificadores reais da operadora para a reserva futura.
 * NÃO reserva, não cobra e não emite nada.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

const MENSAGENS: Record<string, string> = {
  busca_expirada: "Esta busca de carros expirou — refaça a pesquisa.",
  carro_nao_encontrado: "Carro não encontrado nesta busca.",
  protecao_indisponivel: "Proteção não disponível para este carro.",
};

export const Route = createFileRoute("/api/public/internal/v1/cars/select")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "cars:read", async (ctx) => {
          const { carsSelectInput, selecionarCarro } = await import(
            "@/lib/cars/comprefacil-cars.server"
          );
          const parsed = carsSelectInput.safeParse(ctx.body ?? {});
          if (!parsed.success) {
            return fail("invalid_request", "Dados da seleção inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          try {
            const r = await selecionarCarro(parsed.data, ctx.client.id);
            if ("erro" in r) {
              return fail("invalid_request", MENSAGENS[r.erro] ?? r.erro, ctx.correlationId);
            }
            return ok(r, ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
