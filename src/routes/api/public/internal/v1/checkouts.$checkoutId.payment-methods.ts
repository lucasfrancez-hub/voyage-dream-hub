/**
 * GET /api/public/internal/v1/checkouts/{checkoutId}/payment-methods
 * Formas de pagamento REAIS do carrinho (fonte: fornecedor).
 * Regra VIA AIR: embarque em até 72h libera somente Pix.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { lerCheckoutRef } from "@/lib/api/refs.server";

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId/payment-methods")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "payments:read", async (ctx) => {
          const ref = await lerCheckoutRef(params.checkoutId);
          if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
          try {
            const { sessaoDeCompra } = await import("@/lib/api/oner-session.server");
            const { lerCarrinho } = await import("@/lib/integrations/oner/checkout.server");
            const { consultarFormasPagamento } = await import(
              "@/lib/integrations/oner/payment.server"
            );
            const sessao = await sessaoDeCompra(ctx.correlationId, { checkoutId: params.checkoutId });
            if ("falha" in sessao) return sessao.falha;
            const token = sessao.token;
            const { resumo } = await lerCarrinho(ref.cartId, token);
            const { formas, documentoTitularObrigatorio } = await consultarFormasPagamento(
              token,
              ref.cartId,
            );
            const cartao = formas.find((f) => f.paymentMethodId === 1);
            const pix = formas.find((f) => f.paymentMethodId === 4);

            // Embarque em até 72h: somente Pix.
            const partida = resumo?.voos?.[0]?.saida;
            const m = partida?.data?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            let somentePix = false;
            if (m) {
              const [hh, mm] = (partida?.hora || "00:00").split(":").map(Number);
              const ms = new Date(
                Number(m[3]),
                Number(m[2]) - 1,
                Number(m[1]),
                hh || 0,
                mm || 0,
              ).getTime();
              somentePix = ms - Date.now() < 72 * 3600_000;
            }

            return ok(
              {
                checkoutId: params.checkoutId,
                methods: [
                  ...(cartao && !somentePix
                    ? [
                        {
                          method: "CARD" as const,
                          maxCards: cartao.multipleQuantityUsage ?? 1,
                          holderDocumentRequired: documentoTitularObrigatorio,
                        },
                      ]
                    : []),
                  ...(pix ? [{ method: "PIX" as const, provider: "VIAAIR_ASAAS" }] : []),
                ],
                pixOnly: somentePix,
                pixOnlyReason: somentePix
                  ? "Voo com embarque próximo: apenas Pix liberado."
                  : null,
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
