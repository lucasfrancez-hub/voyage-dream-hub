/**
 * POST /api/public/internal/v1/checkouts/{checkoutId}/order
 * Cria o pedido F-… no fornecedor e devolve o pedido VIA AIR correspondente.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { comIdempotencia } from "@/lib/api/idempotency.server";
import { lerCheckoutRef } from "@/lib/api/refs.server";

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId/order")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, ["checkouts:write", "orders:read"], async (ctx) =>
          comIdempotencia(
            {
              clientId: ctx.client.id,
              idempotencyKey: ctx.idempotencyKey,
              endpoint: `/checkouts/${params.checkoutId}/order`,
              body: ctx.body,
              correlationId: ctx.correlationId,
            },
            async () => {
              const ref = await lerCheckoutRef(params.checkoutId);
              if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
              try {
                const { obterToken } = await import("@/lib/integrations/oner/session.server");
                const { criarPedido } = await import("@/lib/integrations/oner/checkout.server");
                const { abrirPedidoDoCarrinho } = await import(
                  "@/lib/integrations/oner/checkout-order.server"
                );
                const token = await obterToken({});
                if (!token) {
                  return fail(
                    "provider_unavailable",
                    "Sessão do fornecedor indisponível.",
                    ctx.correlationId,
                  );
                }
                const aberto = await abrirPedidoDoCarrinho({ cartId: ref.cartId, metodo: "PIX" });
                const r = await criarPedido(ref.cartId, token, aberto.integrationOrderId ?? undefined);
                const numero = r.orderNumber ?? null;
                if (!numero) {
                  return fail(
                    "provider_error",
                    "O fornecedor não devolveu o número do pedido.",
                    ctx.correlationId,
                    { provider: "oner" },
                  );
                }
                const { enfileirarEvento } = await import("@/lib/api/webhooks.server");
                await enfileirarEvento("order.created", {
                  checkoutId: params.checkoutId,
                  orderId: aberto.integrationOrderId,
                  providerOrderNumber: numero,
                });
                return ok(
                  {
                    orderId: aberto.integrationOrderId,
                    providerOrderNumber: numero,
                    status: "CREATED",
                  },
                  ctx.correlationId,
                  201,
                );
              } catch (e) {
                return failFromError(e, ctx.correlationId);
              }
            },
          ),
        ),
    },
  },
});
