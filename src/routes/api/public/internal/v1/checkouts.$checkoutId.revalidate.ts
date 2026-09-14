/**
 * POST /api/public/internal/v1/checkouts/{checkoutId}/revalidate
 * Confere o valor atual do carrinho contra o valor mostrado ao cliente.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { lerCheckoutRef } from "@/lib/api/refs.server";

const entrada = z.object({ expectedAmount: z.number().finite().positive().max(1_000_000) });

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId/revalidate")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, "checkouts:write", async (ctx) => {
          const ref = await lerCheckoutRef(params.checkoutId);
          if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail("invalid_request", "Informe expectedAmount.", ctx.correlationId);
          }
          try {
            const { obterToken } = await import("@/lib/integrations/oner/session.server");
            const { revalidarPreco } = await import("@/lib/integrations/oner/checkout.server");
            const token = await obterToken({});
            if (!token) {
              return fail("provider_unavailable", "Sessão do fornecedor indisponível.", ctx.correlationId);
            }
            const r = await revalidarPreco(ref.cartId, token, parsed.data.expectedAmount);
            if (r.expirado) {
              return ok(
                { status: "EXPIRED", previousAmount: parsed.data.expectedAmount, currentAmount: null },
                ctx.correlationId,
              );
            }
            if (r.mudou) {
              return ok(
                {
                  status: "PRICE_CHANGED",
                  previousAmount: parsed.data.expectedAmount,
                  currentAmount: r.valorAtual,
                  difference: Number(((r.valorAtual ?? 0) - parsed.data.expectedAmount).toFixed(2)),
                },
                ctx.correlationId,
              );
            }
            return ok({ status: "VALID", amount: r.valorAtual }, ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
