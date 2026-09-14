/**
 * POST /api/public/internal/v1/imports/comprar-viagem/reservation
 *
 * A Sky Hub envia apenas o link do checkout (ou o identificador do carrinho).
 * A VIA AIR resolve o cartId, usa a sessão autenticada existente — renovando
 * pelo fluxo atual quando necessário — lê a reserva no fornecedor e devolve o
 * payload normalizado. Nenhum dado de autenticação do fornecedor é exposto.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

export const Route = createFileRoute("/api/public/internal/v1/imports/comprar-viagem/reservation")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "checkouts:read", async (ctx) => {
          const { extrairCartIdDeEntrada, normalizarReserva, registrarImportacao } = await import(
            "@/lib/api/imports/comprar-viagem.server"
          );

          const checkoutUrl =
            typeof ctx.body["checkoutUrl"] === "string" ? (ctx.body["checkoutUrl"] as string) : null;
          const checkoutId =
            typeof ctx.body["checkoutId"] === "string" ? (ctx.body["checkoutId"] as string) : null;

          const cartId = extrairCartIdDeEntrada(checkoutId ?? checkoutUrl);
          if (!cartId) {
            await registrarImportacao({
              cartId: null,
              sourceUrl: checkoutUrl,
              correlationId: ctx.correlationId,
              sucesso: false,
              detalhe: "link inválido",
            });
            return fail(
              "invalid_request",
              "Informe checkoutUrl (link do checkout da Comprar Viagem) ou checkoutId.",
              ctx.correlationId,
            );
          }

          try {
            const { sessaoDeCompra } = await import("@/lib/api/oner-session.server");
            const { pedidoPendente } = await import("@/lib/integrations/oner/otp.server");
            const { lerCarrinho } = await import("@/lib/integrations/oner/checkout.server");

            const sessao = await sessaoDeCompra(ctx.correlationId, { checkoutId: cartId });
            if ("falha" in sessao) {
              // Renovação em andamento (código a caminho) x indisponível de fato.
              const emRenovacao = await pedidoPendente().catch(() => null);
              await registrarImportacao({
                cartId,
                sourceUrl: checkoutUrl,
                correlationId: ctx.correlationId,
                sucesso: false,
                detalhe: emRenovacao ? "sessão em renovação" : "sessão indisponível",
              });
              if (!emRenovacao) return sessao.falha;
              return fail(
                "provider_session_renewing",
                "A conexão com o fornecedor está sendo reativada. Repita a chamada em instantes.",
                ctx.correlationId,
                { provider: "comprar_viagem", details: { retryAfterSeconds: 20 } },
              );
            }

            const { call, body } = await lerCarrinho(cartId, sessao.token);

            if (call.status === 401 || call.status === 403) {
              await registrarImportacao({
                cartId,
                sourceUrl: checkoutUrl,
                correlationId: ctx.correlationId,
                sucesso: false,
                detalhe: "sessão recusada pelo fornecedor",
                status: call.status,
              });
              return fail(
                "provider_session_unavailable",
                "A sessão do fornecedor precisa ser reativada. Repita a chamada em instantes.",
                ctx.correlationId,
                { provider: "comprar_viagem", details: { retryAfterSeconds: 60 } },
              );
            }

            if (call.status === 404 || !body) {
              await registrarImportacao({
                cartId,
                sourceUrl: checkoutUrl,
                correlationId: ctx.correlationId,
                sucesso: false,
                detalhe: "reserva não encontrada ou expirada",
                status: call.status,
              });
              return fail(
                "not_found",
                "Esta reserva não está mais disponível no fornecedor.",
                ctx.correlationId,
              );
            }

            if (!call.ok) {
              await registrarImportacao({
                cartId,
                sourceUrl: checkoutUrl,
                correlationId: ctx.correlationId,
                sucesso: false,
                detalhe: "fornecedor indisponível",
                status: call.status,
              });
              return fail(
                "provider_unavailable",
                "O fornecedor não respondeu à consulta da reserva.",
                ctx.correlationId,
                { provider: "comprar_viagem" },
              );
            }

            const reserva = normalizarReserva(body, { cartId, sourceUrl: checkoutUrl });
            await registrarImportacao({
              cartId,
              sourceUrl: checkoutUrl,
              correlationId: ctx.correlationId,
              sucesso: true,
              detalhe: `${reserva.segments.length} trecho(s), ${reserva.passengers.length} passageiro(s)`,
              status: call.status,
            });
            return ok({ ...reserva, correlationId: ctx.correlationId }, ctx.correlationId);
          } catch (e) {
            await registrarImportacao({
              cartId,
              sourceUrl: checkoutUrl,
              correlationId: ctx.correlationId,
              sucesso: false,
              detalhe: "erro inesperado",
            });
            return failFromError(e, ctx.correlationId, "comprar_viagem");
          }
        }),
    },
  },
});
