/**
 * POST /api/public/internal/v1/wallet/charges/{chargeId}/refund
 * Abre a devolução ao cliente quando a reserva não se confirma.
 *
 * A execução da devolução é conferida por pessoa: aqui a cobrança fica em
 * refund_pending e o consumidor da API é avisado da mudança.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";

const entrada = z.object({ reason: z.string().trim().min(3).max(300) });

export const Route = createFileRoute("/api/public/internal/v1/wallet/charges/$chargeId/refund")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, "wallet:refund", async (ctx) => {
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail("invalid_request", "Informe o motivo (reason).", ctx.correlationId);
          }
          const { lerCobranca } = await import("@/lib/wallet/store.server");
          const charge = await lerCobranca(params.chargeId);
          if (!charge || charge.api_client_id !== ctx.client.id) {
            return fail("not_found", "Cobrança não encontrada.", ctx.correlationId);
          }
          const { abrirReembolso } = await import("@/lib/wallet/charges.server");
          const r = await abrirReembolso({
            referencia: params.chargeId,
            motivo: parsed.data.reason,
          });
          if (!r.ok) {
            return fail(
              r.motivo === "not_found" ? "not_found" : "conflict",
              r.motivo === "not_found"
                ? "Cobrança não encontrada."
                : "Só é possível devolver uma cobrança que o cliente pagou.",
              ctx.correlationId,
            );
          }
          return ok(r.charge, ctx.correlationId);
        }),
    },
  },
});
