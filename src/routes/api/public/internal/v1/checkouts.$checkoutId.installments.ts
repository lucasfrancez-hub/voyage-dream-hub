/**
 * POST /api/public/internal/v1/checkouts/{checkoutId}/installments
 * Parcelamento real do fornecedor para um cartão já guardado no cofre.
 * Nenhum cálculo é feito aqui.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { lerCheckoutRef } from "@/lib/api/refs.server";

const entrada = z.object({
  amount: z.number().finite().positive().max(1_000_000),
  cardToken: z.string().min(4).max(200),
  cardKey: z.string().min(4).max(200),
  multipleCards: z.boolean().default(false),
});

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId/installments")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, "payments:read", async (ctx) => {
          const ref = await lerCheckoutRef(params.checkoutId);
          if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail(
              "invalid_request",
              "Informe amount, cardToken e cardKey (obtidos em payments/card-token).",
              ctx.correlationId,
            );
          }
          try {
            const { sessaoDeCompra } = await import("@/lib/api/oner-session.server");
            const { consultarParcelasDoCartao } = await import(
              "@/lib/integrations/oner/payment.server"
            );
            const sessao = await sessaoDeCompra(ctx.correlationId, { checkoutId: params.checkoutId });
            if ("falha" in sessao) return sessao.falha;
            const token = sessao.token;
            const r = await consultarParcelasDoCartao(token, ref.cartId, {
              totalValue: Number(parsed.data.amount.toFixed(2)),
              vaultToken: parsed.data.cardToken,
              vaultKey: parsed.data.cardKey,
              multiplosCartoes: parsed.data.multipleCards,
            });
            if (!r.call.ok || r.opcoes.length === 0) {
              return fail(
                "provider_error",
                "O fornecedor não devolveu opções de parcelamento para este cartão.",
                ctx.correlationId,
                { provider: "oner" },
              );
            }
            return ok({ installments: r.opcoes }, ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
