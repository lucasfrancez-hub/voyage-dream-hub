/**
 * GET /api/public/internal/v1/orders/{orderId}/tickets
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/internal/v1/orders/$orderId/tickets")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "tickets:read", async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: op } = await supabaseAdmin
            .from("integration_orders")
            .select("id")
            .or(`id.eq.${params.orderId},viaair_order_id.eq.${params.orderId}`)
            .maybeSingle();
          const id = (op as { id?: string } | null)?.id;
          if (!id) return fail("not_found", "Pedido não encontrado.", ctx.correlationId);
          const { data } = await supabaseAdmin
            .from("integration_tickets")
            .select("passenger_name,ticket_number,pnr,airline,status")
            .eq("integration_order_id", id);
          return ok(
            {
              orderId: id,
              tickets: ((data ?? []) as Array<Record<string, unknown>>).map((t) => ({
                passenger: t["passenger_name"],
                ticketNumber: t["ticket_number"],
                pnr: t["pnr"],
                airline: t["airline"],
                status: t["status"],
              })),
            },
            ctx.correlationId,
          );
        }),
    },
  },
});
