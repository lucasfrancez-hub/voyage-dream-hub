/**
 * GET /api/public/internal/v1/multicity/groups/{groupId}
 * Resumo da viagem multitrecho: cada perna continua sendo uma reserva
 * independente (pedido, pagamento, localizador e bilhete próprios).
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { statusDoPedido } from "@/lib/api/normalize";
import { atualizarGrupo, atualizarItem, lerGrupo, statusDoGrupo } from "@/lib/api/multicity.server";
import { lerCheckoutRef } from "@/lib/api/refs.server";

export const Route = createFileRoute("/api/public/internal/v1/multicity/groups/$groupId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "checkouts:read", async (ctx) => {
          try {
            const grupo = await lerGrupo(params.groupId, ctx.client.id);
            if (!grupo) return fail("not_found", "Grupo não encontrado.", ctx.correlationId);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

            const reservas = [];
            for (const item of grupo.itens) {
              let pedido: Record<string, unknown> | null = null;
              if (item.order_id) {
                const { data } = await supabaseAdmin
                  .from("integration_orders")
                  .select(
                    "id,state,customer_payment_status,provider_payment_status,locator,provider_order_number",
                  )
                  .eq("id", item.order_id)
                  .maybeSingle();
                pedido = data as Record<string, unknown> | null;
              } else if (item.checkout_id) {
                const ref = await lerCheckoutRef(item.checkout_id);
                if (ref?.cartId) {
                  const { data } = await supabaseAdmin
                    .from("integration_orders")
                    .select(
                      "id,state,customer_payment_status,provider_payment_status,locator,provider_order_number",
                    )
                    .or(`provider_cart_id.eq.${ref.cartId},original_cart_id.eq.${ref.cartId}`)
                    .maybeSingle();
                  pedido = data as Record<string, unknown> | null;
                  if (pedido?.["id"]) {
                    await atualizarItem(grupo.group_id, item.sequence, {
                      order_id: pedido["id"] as string,
                    });
                  }
                }
              }

              const estado = pedido ? statusDoPedido(pedido["state"] as string) : item.status;
              const ticketStatus =
                estado === "TICKETS_RECEIVED" || estado === "COMPLETE" ? "ISSUED" : "PENDING";
              reservas.push({
                sequence: item.sequence,
                checkoutId: item.checkout_id,
                orderId: (pedido?.["id"] as string) ?? item.order_id,
                origin: item.origin,
                destination: item.destination,
                departureDate: item.departure_date,
                amount: item.amount === null ? null : Number(item.amount),
                status: estado,
                paymentStatus: (pedido?.["customer_payment_status"] as string) ?? null,
                supplierPaymentStatus: (pedido?.["provider_payment_status"] as string) ?? null,
                locator: (pedido?.["locator"] as string) ?? null,
                providerOrderNumber: (pedido?.["provider_order_number"] as string) ?? null,
                ticketStatus,
                error: item.last_error,
              });
            }

            const status = statusDoGrupo(
              reservas.map((r) => ({
                status: r.status,
                paymentStatus: r.paymentStatus,
                ticketStatus: r.ticketStatus,
                checkoutCriado: Boolean(r.checkoutId),
              })),
            );
            if (status !== grupo.status) await atualizarGrupo(grupo.group_id, { status });

            return ok(
              {
                groupId: grupo.group_id,
                type: "MULTICITY",
                status,
                searchId: grupo.search_id,
                currency: grupo.currency,
                totalAmount: Number(grupo.total_amount),
                reservations: reservas,
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
