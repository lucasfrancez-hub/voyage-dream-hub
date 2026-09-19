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
          const corpo = (ctx.body ?? {}) as Record<string, unknown>;
          // Modo assíncrono: devolve search_id na hora e o Sky Hub acompanha em
          // GET /services/search/{search_id}, sem travar aéreo e hotel.
          const assincrono = corpo["async"] === true || corpo["modo"] === "async";
          const parsed = servicesSearchInput.safeParse(corpo);
          if (!parsed.success) {
            return fail("invalid_request", "Dados da busca inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          try {
            if (assincrono) {
              const { iniciarBuscaServicos } = await import("@/lib/services/async-search.server");
              return ok(
                await iniciarBuscaServicos(parsed.data, ctx.client.id),
                ctx.correlationId,
              );
            }
            return ok(await buscarServicos(parsed.data, ctx.client.id), ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
