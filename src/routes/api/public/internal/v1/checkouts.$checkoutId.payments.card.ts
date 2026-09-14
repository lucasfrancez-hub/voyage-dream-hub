/**
 * POST /api/public/internal/v1/checkouts/{checkoutId}/payments/card
 * Pagamento com 1 a 3 cartões já guardados no cofre (card-token).
 * A soma dos valores precisa ser exatamente o total da compra.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { comIdempotencia } from "@/lib/api/idempotency.server";
import { lerCheckoutRef } from "@/lib/api/refs.server";

const cartao = z.object({
  cardToken: z.string().min(4).max(200),
  cardKey: z.string().min(4).max(200),
  brand: z.string().min(2).max(30),
  cardBin: z.string().min(4).max(10),
  lastDigits: z.string().min(2).max(6),
  holderName: z.string().trim().min(2).max(80),
  documentType: z.number().int().min(1).max(9).default(1),
  documentNumber: z.string().trim().min(11).max(20),
  expirationMonth: z.number().int().min(1).max(12),
  expirationYear: z.number().int().min(2024).max(2100),
  amount: z.number().finite().positive().max(1_000_000),
  installments: z.number().int().min(1).max(24),
  interestRate: z.number().min(0).max(100).default(0),
});

const pagador = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(80),
  documentNumber: z.string().trim().min(11).max(20),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email().max(160),
  phone: z.string().trim().min(8).max(20),
  zipCode: z.string().trim().min(8).max(9),
  street: z.string().trim().min(2).max(120),
  number: z.string().trim().min(1).max(12),
  complement: z.string().trim().max(60).optional(),
  neighborhood: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(40),
});

const entrada = z.object({
  cards: z.array(cartao).min(1).max(3),
  totalAmount: z.number().finite().positive().max(1_000_000),
  payer: pagador,
});

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId/payments/card")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, "payments:write", async (ctx) =>
          comIdempotencia(
            {
              clientId: ctx.client.id,
              idempotencyKey: ctx.idempotencyKey,
              endpoint: `/checkouts/${params.checkoutId}/payments/card`,
              body: ctx.body,
              correlationId: ctx.correlationId,
            },
            async () => {
              const ref = await lerCheckoutRef(params.checkoutId);
              if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
              const parsed = entrada.safeParse(ctx.body);
              if (!parsed.success) {
                return fail("invalid_request", "Dados do pagamento inválidos.", ctx.correlationId, {
                  details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
                });
              }
              const d = parsed.data;
              const soma = Number(d.cards.reduce((s, c) => s + c.amount, 0).toFixed(2));
              if (soma !== Number(d.totalAmount.toFixed(2))) {
                return fail(
                  "invalid_request",
                  "A soma dos cartões precisa ser igual ao total da compra.",
                  ctx.correlationId,
                );
              }
              try {
                const { sessaoDeCompra } = await import("@/lib/api/oner-session.server");
                const { pagarComCartoes, salvarPagador } = await import(
                  "@/lib/integrations/oner/payment.server"
                );
                const sessao = await sessaoDeCompra(ctx.correlationId, { checkoutId: params.checkoutId });
                if ("falha" in sessao) return sessao.falha;
                const token = sessao.token;
                const p = d.payer;
                const salvo = await salvarPagador(token, {
                  cartId: ref.cartId,
                  firstName: p.firstName,
                  lastName: p.lastName,
                  documentNumber: p.documentNumber.replace(/\D/g, ""),
                  documentTypeId: 1,
                  birthDate: p.birthDate,
                  email: p.email.toLowerCase(),
                  mobilePhone: p.phone.replace(/\D/g, ""),
                  mobilePhoneCountryCode: 55,
                  countryId: 30,
                  city: p.city,
                  stateOrProvice: p.state,
                  street: p.street,
                  neighborhood: p.neighborhood,
                  houseNumber: p.number,
                  complement: p.complement ?? "",
                  zipCode: p.zipCode.replace(/\D/g, ""),
                });
                if (!salvo.call.ok) {
                  return fail(
                    "provider_error",
                    "O fornecedor recusou os dados do pagador.",
                    ctx.correlationId,
                    { provider: "oner" },
                  );
                }

                const r = await pagarComCartoes(token, {
                  cartId: ref.cartId,
                  cartoes: d.cards.map((c) => ({
                    installments: c.installments,
                    value: Number(c.amount.toFixed(2)),
                    interestRate: c.interestRate,
                    creditCard: {
                      vaultToken: c.cardToken,
                      vaultKey: c.cardKey,
                      brand: c.brand,
                      bin: c.cardBin,
                      lastNumbers: c.lastDigits,
                      name: c.holderName,
                      documentTypeId: c.documentType,
                      documentNumber: c.documentNumber,
                      expirationMonth: c.expirationMonth,
                      expirationYear: c.expirationYear,
                    },
                  })),
                  purchaseForCustomer: salvo.purchaseForCustomer,
                });

                if (!r.call.ok || !r.compra) {
                  return fail(
                    "provider_error",
                    "Não foi possível concluir o pagamento no fornecedor.",
                    ctx.correlationId,
                    { provider: "oner" },
                  );
                }
                if (r.compra.cartExpired) {
                  return fail("conflict", "Esta reserva expirou.", ctx.correlationId);
                }
                if (r.compra.wasChanged) {
                  return fail("price_changed", "O valor da passagem mudou.", ctx.correlationId);
                }
                if (r.compra.paymentError || !r.compra.reservationCode) {
                  return fail(
                    "payment_declined",
                    "Pagamento não autorizado pelo banco emissor.",
                    ctx.correlationId,
                  );
                }

                const { concluirPedidoDoCarrinho } = await import(
                  "@/lib/integrations/oner/checkout-order.server"
                );
                const pedido = await concluirPedidoDoCarrinho({
                  cartId: ref.cartId,
                  metodo: "CARD",
                  localizador: r.compra.reservationCode,
                });
                const { enfileirarEvento } = await import("@/lib/api/webhooks.server");
                await enfileirarEvento("customer.payment.paid", {
                  checkoutId: params.checkoutId,
                  method: "CARD",
                  amount: d.totalAmount,
                  locator: r.compra.reservationCode,
                });

                return ok(
                  {
                    status: "PAID",
                    method: "CARD",
                    amount: d.totalAmount,
                    locator: r.compra.reservationCode,
                    orderId: pedido.viaairOrderId ?? null,
                  },
                  ctx.correlationId,
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
