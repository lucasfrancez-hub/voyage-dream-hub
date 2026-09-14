/**
 * Pix do CLIENTE — o QR Code é sempre da VIA AIR (Asaas), nunca o do
 * fornecedor. O Pix pago ao fornecedor é interno e não é exposto aqui.
 *
 * POST  /checkouts/{checkoutId}/payments/pix  → gera a cobrança
 * GET   /checkouts/{checkoutId}/payments/pix  → situação da cobrança
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { comIdempotencia } from "@/lib/api/idempotency.server";
import { lerCheckoutRef } from "@/lib/api/refs.server";
import { statusDoPagamento } from "@/lib/api/normalize";

const entrada = z.object({
  amount: z.number().finite().positive().max(1_000_000),
  payer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email().max(160).optional(),
    documentNumber: z.string().trim().min(11).max(20),
  }),
});

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId/payments/pix")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, "payments:write", async (ctx) =>
          comIdempotencia(
            {
              clientId: ctx.client.id,
              idempotencyKey: ctx.idempotencyKey,
              endpoint: `/checkouts/${params.checkoutId}/payments/pix`,
              body: ctx.body,
              correlationId: ctx.correlationId,
            },
            async () => {
              const ref = await lerCheckoutRef(params.checkoutId);
              if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
              const parsed = entrada.safeParse(ctx.body);
              if (!parsed.success) {
                return fail("invalid_request", "Informe amount e os dados do pagador.", ctx.correlationId);
              }
              try {
                const { abrirPedidoDoCarrinho, concluirPedidoDoCarrinho } = await import(
                  "@/lib/integrations/oner/checkout-order.server"
                );
                const aberto = await abrirPedidoDoCarrinho({ cartId: ref.cartId, metodo: "PIX" });
                if (!aberto.viaairOrderId) {
                  return fail(
                    "provider_error",
                    "Não foi possível abrir o pedido desta reserva.",
                    ctx.correlationId,
                  );
                }
                const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                await supabaseAdmin
                  .from("orders")
                  .update({
                    payment_method: "pix",
                    full_name: parsed.data.payer.name,
                    cpf: parsed.data.payer.documentNumber.replace(/\D/g, ""),
                    ...(parsed.data.payer.email
                      ? { email: parsed.data.payer.email.toLowerCase() }
                      : {}),
                  } as never)
                  .eq("id", aberto.viaairOrderId);

                const { criarPixParaPedido } = await import("@/lib/pix-cobranca.server");
                const pix = await criarPixParaPedido({
                  orderId: aberto.viaairOrderId,
                  valorEsperado: parsed.data.amount,
                });
                await concluirPedidoDoCarrinho({
                  cartId: ref.cartId,
                  metodo: "PIX",
                  pixExpiraEm: pix.expiraEm,
                });

                return ok(
                  {
                    paymentId: pix.txid,
                    txid: pix.txid,
                    orderId: aberto.viaairOrderId,
                    amount: pix.valor,
                    currency: "BRL",
                    qrCode: pix.qrCode,
                    expiresAt: pix.expiraEm,
                    status: "ACTIVE",
                    provider: "VIAAIR_ASAAS",
                  },
                  ctx.correlationId,
                  201,
                );
              } catch (e) {
                return failFromError(e, ctx.correlationId, "asaas");
              }
            },
          ),
        ),

      GET: async ({ request, params }) =>
        withApi(request, "payments:read", async (ctx) => {
          const ref = await lerCheckoutRef(params.checkoutId);
          if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: op } = await supabaseAdmin
            .from("integration_orders")
            .select("viaair_order_id,customer_payment_status,customer_payment_txid,provider_pix_expires_at")
            .eq("provider_cart_id", ref.cartId)
            .maybeSingle();
          const linha = op as {
            viaair_order_id: string | null;
            customer_payment_status: string | null;
            customer_payment_txid: string | null;
            provider_pix_expires_at: string | null;
          } | null;
          if (!linha) return fail("not_found", "Nenhum Pix gerado para este checkout.", ctx.correlationId);
          return ok(
            {
              paymentId: linha.customer_payment_txid,
              orderId: linha.viaair_order_id,
              status: statusDoPagamento(linha.customer_payment_status, linha.provider_pix_expires_at),
              expiresAt: linha.provider_pix_expires_at,
              provider: "VIAAIR_ASAAS",
            },
            ctx.correlationId,
          );
        }),
    },
  },
});
