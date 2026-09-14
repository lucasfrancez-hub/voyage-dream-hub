/**
 * GET /api/public/internal/v1/checkouts/{checkoutId}
 * Conteúdo do carrinho: voos, valores, passageiros e validade.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { lerCheckoutRef } from "@/lib/api/refs.server";

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "checkouts:read", async (ctx) => {
          const ref = await lerCheckoutRef(params.checkoutId);
          if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
          try {
            const { sessaoDeCompra } = await import("@/lib/api/oner-session.server");
            const { lerCarrinho } = await import("@/lib/integrations/oner/checkout.server");
            const sessao = await sessaoDeCompra(ctx.correlationId, { checkoutId: params.checkoutId });
            if ("falha" in sessao) return sessao.falha;
            const token = sessao.token;
            const { resumo } = await lerCarrinho(ref.cartId, token);
            if (!resumo) {
              return fail("not_found", "Este carrinho não está mais disponível.", ctx.correlationId);
            }
            return ok(
              {
                checkoutId: params.checkoutId,
                status: resumo.expirado ? "EXPIRED" : "ACTIVE",
                currency: resumo.moeda ?? "BRL",
                amount: { fare: resumo.tarifa, taxes: resumo.taxas, total: resumo.total },
                passengersCount: {
                  adults: resumo.adultos,
                  children: resumo.criancas,
                  infants: resumo.bebes,
                },
                flights: resumo.voos,
                prices: resumo.precos,
                installments: resumo.parcelas,
                passengers: resumo.passageiros,
                passengersSaved: resumo.passageirosPersistidos,
              },
              ctx.correlationId,
            );
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
