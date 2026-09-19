/**
 * POST /api/public/internal/v1/wallet/payouts/pix
 * Quita um Pix copia e cola de fornecedor com o saldo da VIA AIR.
 *
 * Server-to-server, token e permissão próprios (wallet:payout).
 * A VIA AIR não gera esse Pix, não revalida reserva e não fala com o
 * fornecedor: ela apenas paga a instrução recebida, uma única vez.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";

const entrada = z.object({
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
  pixCopyPaste: z.string().trim().min(40).max(4000),
  amount: z.number().finite().positive().max(1_000_000).optional(),
  orderId: z.string().trim().max(120).optional(),
  paymentId: z.string().trim().max(120).optional(),
  externalReference: z.string().trim().max(160).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  description: z.string().trim().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const CODIGO_HTTP: Record<string, "invalid_request" | "conflict" | "not_found" | "provider_error"> = {
  pix_expired: "conflict",
  amount_mismatch: "conflict",
  amount_unknown: "invalid_request",
  charge_not_found: "not_found",
  customer_not_paid: "conflict",
  manual_review: "conflict",
  insufficient_balance: "conflict",
  authorization_setup_failed: "provider_error",
  provider_error: "provider_error",
  internal_error: "provider_error",
};

export const Route = createFileRoute("/api/public/internal/v1/wallet/payouts/pix")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "wallet:payout", async (ctx) => {
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail(
              "invalid_request",
              "Informe pixCopyPaste e uma idempotencyKey (corpo ou header Idempotency-Key).",
              ctx.correlationId,
            );
          }
          const chave = parsed.data.idempotencyKey ?? ctx.idempotencyKey;
          if (!chave) {
            return fail(
              "invalid_request",
              "idempotencyKey é obrigatória para pagamento de saída.",
              ctx.correlationId,
            );
          }

          const { pagarPixCopiaECola } = await import("@/lib/wallet/payouts.server");
          const r = await pagarPixCopiaECola({
            apiClientId: ctx.client.id,
            idempotencyKey: chave,
            pixCopyPaste: parsed.data.pixCopyPaste,
            amount: parsed.data.amount ?? null,
            orderId: parsed.data.orderId ?? null,
            chargePaymentId: parsed.data.paymentId ?? null,
            externalReference: parsed.data.externalReference ?? null,
            expiresAt: parsed.data.expiresAt ?? null,
            description: parsed.data.description ?? null,
            metadata: parsed.data.metadata ?? null,
          });

          if (!r.ok) {
            return fail(CODIGO_HTTP[r.code] ?? "provider_error", r.message, ctx.correlationId, {
              details: { code: r.code, payout: r.payout ?? null },
            });
          }
          return ok({ ...r.payout, duplicate: r.duplicate }, ctx.correlationId, r.duplicate ? 200 : 202);
        }),
    },
  },
});
