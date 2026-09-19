/**
 * GET /api/public/internal/v1/wallet/charges/{chargeId}/events
 * Trilha de auditoria da cobrança e dos pagamentos ligados a ela.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/internal/v1/wallet/charges/$chargeId/events")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "wallet:read", async (ctx) => {
          const { lerCobranca, db } = await import("@/lib/wallet/store.server");
          const charge = await lerCobranca(params.chargeId);
          if (!charge || charge.api_client_id !== ctx.client.id) {
            return fail("not_found", "Cobrança não encontrada.", ctx.correlationId);
          }
          const supabase = await db();
          const { data: payouts } = await supabase
            .from("wallet_payouts")
            .select("id")
            .eq("charge_id", charge.id);
          const ids = ((payouts ?? []) as Array<{ id: string }>).map((p) => p.id);
          const { data } = await supabase
            .from("wallet_events")
            .select("type,status,message,created_at,payout_id")
            .or(`charge_id.eq.${charge.id}${ids.length ? `,payout_id.in.(${ids.join(",")})` : ""}`)
            .order("created_at", { ascending: true })
            .limit(200);
          const eventos = (data ?? []) as Array<{
            type: string;
            status: string | null;
            message: string | null;
            created_at: string;
            payout_id: string | null;
          }>;
          return ok(
            {
              paymentId: charge.external_reference,
              events: eventos.map((e) => ({
                type: e.type,
                status: e.status,
                message: e.message,
                payoutId: e.payout_id,
                at: e.created_at,
              })),
            },
            ctx.correlationId,
          );
        }),
    },
  },
});
