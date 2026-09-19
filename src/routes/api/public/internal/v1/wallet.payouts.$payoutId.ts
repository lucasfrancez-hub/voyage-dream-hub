/**
 * GET /api/public/internal/v1/wallet/payouts/{payoutId}
 * Situação da saída Pix. Consulta o banco emissor quando ainda está em curso.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/internal/v1/wallet/payouts/$payoutId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "wallet:read", async (ctx) => {
          const { lerPagamento } = await import("@/lib/wallet/store.server");
          const payout = await lerPagamento(params.payoutId);
          if (!payout || payout.api_client_id !== ctx.client.id) {
            return fail("not_found", "Pagamento não encontrado.", ctx.correlationId);
          }
          const { sincronizarPagamento } = await import("@/lib/wallet/payouts.server");
          const atual = await sincronizarPagamento(payout.id);
          return ok(atual, ctx.correlationId);
        }),
    },
  },
});
