/**
 * GET /api/public/internal/v1/orders/{orderId}
 * Retrato completo do pedido: pagamentos, localizador, passageiros e bilhetes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { statusDoPedido } from "@/lib/api/normalize";

export const Route = createFileRoute("/api/public/internal/v1/orders/$orderId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "orders:read", async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("integration_orders")
            .select("*")
            .or(`id.eq.${params.orderId},viaair_order_id.eq.${params.orderId}`)
            .maybeSingle();
          const o = data as Record<string, unknown> | null;
          if (!o) return fail("not_found", "Pedido não encontrado.", ctx.correlationId);

          const [{ data: pax }, { data: tks }] = await Promise.all([
            supabaseAdmin
              .from("integration_passengers")
              .select("first_name,last_name,passenger_type,birth_date,document_number")
              .eq("integration_order_id", o["id"] as string),
            supabaseAdmin
              .from("integration_tickets")
              .select("passenger_name,ticket_number,pnr,airline,status")
              .eq("integration_order_id", o["id"] as string),
          ]);

          return ok(
            {
              orderId: o["id"],
              viaairOrderId: o["viaair_order_id"],
              providerOrderNumber: o["provider_order_number"],
              saleId: o["provider_sale_id"],
              status: statusDoPedido(o["state"] as string),
              rawState: o["state"],
              amount: o["customer_total"] ?? o["amount"],
              currency: o["currency"] ?? "BRL",
              paymentMethod: o["payment_method"],
              customerPaymentStatus: o["customer_payment_status"],
              supplierPaymentStatus: o["provider_payment_status"],
              locator: o["locator"],
              passengers: pax ?? [],
              tickets: tks ?? [],
              lastError: o["last_error"],
              createdAt: o["created_at"],
              updatedAt: o["updated_at"],
            },
            ctx.correlationId,
          );
        }),
    },
  },
});
