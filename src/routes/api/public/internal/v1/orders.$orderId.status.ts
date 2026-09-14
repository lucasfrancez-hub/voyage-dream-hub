/**
 * GET /api/public/internal/v1/orders/{orderId}/status
 * Situação resumida, com pagamento do cliente e pagamento do fornecedor
 * sempre separados.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { statusDoPedido } from "@/lib/api/normalize";

export const Route = createFileRoute("/api/public/internal/v1/orders/$orderId/status")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "orders:read", async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("integration_orders")
            .select(
              "id,viaair_order_id,state,state_detail,customer_payment_status,provider_payment_status,locator,provider_order_number,updated_at",
            )
            .or(`id.eq.${params.orderId},viaair_order_id.eq.${params.orderId}`)
            .maybeSingle();
          const o = data as Record<string, unknown> | null;
          if (!o) return fail("not_found", "Pedido não encontrado.", ctx.correlationId);
          return ok(
            {
              orderId: o["id"],
              status: statusDoPedido(o["state"] as string),
              detail: o["state_detail"],
              customerPaymentStatus: o["customer_payment_status"],
              supplierPaymentStatus: o["provider_payment_status"],
              locator: o["locator"],
              providerOrderNumber: o["provider_order_number"],
              updatedAt: o["updated_at"],
            },
            ctx.correlationId,
          );
        }),
    },
  },
});
