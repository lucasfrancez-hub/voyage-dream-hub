/**
 * POST /api/public/internal/v1/checkouts/{checkoutId}/payments/card-token
 * Guarda o cartão no cofre da operadora e devolve apenas a referência.
 * PAN e CVV nunca são gravados, registrados em log ou devolvidos.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { lerCheckoutRef } from "@/lib/api/refs.server";

const entrada = z.object({
  holderName: z.string().trim().min(2).max(80),
  number: z.string().trim().min(12).max(20),
  cvv: z.string().trim().min(3).max(4),
  expirationMonth: z.string().trim().min(1).max(2),
  expirationYear: z.string().trim().min(2).max(4),
  documentType: z.number().int().min(1).max(9).default(1),
  documentNumber: z.string().trim().min(11).max(20),
});

export const Route = createFileRoute(
  "/api/public/internal/v1/checkouts/$checkoutId/payments/card-token",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, "payments:write", async (ctx) => {
          const ref = await lerCheckoutRef(params.checkoutId);
          if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail("invalid_request", "Dados do cartão inválidos.", ctx.correlationId);
          }
          try {
            const { guardarCartaoNoCofre } = await import("@/lib/integrations/oner/payment.server");
            const cofre = await guardarCartaoNoCofre({
              nome: parsed.data.holderName,
              numero: parsed.data.number,
              cvv: parsed.data.cvv,
              mesValidade: parsed.data.expirationMonth,
              anoValidade: parsed.data.expirationYear,
              documentoTipo: parsed.data.documentType,
              documentoNumero: parsed.data.documentNumber,
            });
            if (!cofre.ok || !cofre.cofre) {
              return fail("payment_declined", "Cartão não validado pela operadora.", ctx.correlationId, {
                provider: "oner",
              });
            }
            return ok(
              {
                cardToken: cofre.cofre.Token,
                cardKey: cofre.cofre.Key,
                brand: cofre.cofre.Brand,
                cardBin: cofre.cofre.CardBin,
                lastDigits: cofre.cofre.LastDigts,
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
