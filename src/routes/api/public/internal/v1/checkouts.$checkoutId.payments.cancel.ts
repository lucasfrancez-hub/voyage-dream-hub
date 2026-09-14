/**
 * POST /api/public/internal/v1/checkouts/{checkoutId}/payments/cancel
 * Cancela a tentativa de pagamento em aberto no fornecedor.
 * NÃO cancela bilhete já emitido.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { lerCheckoutRef } from "@/lib/api/refs.server";

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId/payments/cancel")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, "payments:write", async (ctx) => {
          const ref = await lerCheckoutRef(params.checkoutId);
          if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
          try {
            const { sessaoDeCompra } = await import("@/lib/api/oner-session.server");
            const { cancelarPagamento } = await import("@/lib/integrations/oner/payment.server");
            const sessao = await sessaoDeCompra(ctx.correlationId, { checkoutId: params.checkoutId });
            if ("falha" in sessao) return sessao.falha;
            const token = sessao.token;
            const call = await cancelarPagamento(token, ref.cartId);
            if (!call.ok) {
              return fail(
                "provider_error",
                "O fornecedor não cancelou o pagamento em aberto.",
                ctx.correlationId,
                { provider: "oner" },
              );
            }
            return ok(
              { checkoutId: params.checkoutId, status: "CANCELLED", ticketsAffected: false },
              ctx.correlationId,
            );
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
