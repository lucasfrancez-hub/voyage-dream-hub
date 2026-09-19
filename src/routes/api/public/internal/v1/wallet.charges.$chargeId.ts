/**
 * GET /api/public/internal/v1/wallet/charges/{chargeId}
 * Situação da cobrança Pix do cliente.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/internal/v1/wallet/charges/$chargeId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "wallet:read", async (ctx) => {
          const { lerCobranca, cobrancaParaApi } = await import("@/lib/wallet/store.server");
          const charge = await lerCobranca(params.chargeId);
          if (!charge || charge.api_client_id !== ctx.client.id) {
            return fail("not_found", "Cobrança não encontrada.", ctx.correlationId);
          }
          return ok(cobrancaParaApi(charge), ctx.correlationId);
        }),
    },
  },
});
