/**
 * POST /api/public/internal/v1/services/select
 *
 * Seleciona (persiste) uma opção de serviço da busca anterior, guardando os
 * identificadores reais da operadora para a reserva futura.
 * NÃO reserva nada: o payload de reserva de serviços ainda não existe.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

const MENSAGENS: Record<string, string> = {
  busca_expirada: "Esta busca de serviços expirou — refaça a pesquisa.",
  servico_nao_encontrado: "Serviço não encontrado nesta busca.",
  opcao_indisponivel: "Data/horário não disponível para este serviço.",
};

export const Route = createFileRoute("/api/public/internal/v1/services/select")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "services:read", async (ctx) => {
          const { servicesSelectInput, selecionarServico } = await import(
            "@/lib/services/comprefacil-services.server"
          );
          const parsed = servicesSelectInput.safeParse(ctx.body ?? {});
          if (!parsed.success) {
            return fail("invalid_request", "Dados da seleção inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          try {
            const r = await selecionarServico(parsed.data, ctx.client.id);
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
