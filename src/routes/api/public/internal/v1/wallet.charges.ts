/**
 * POST /api/public/internal/v1/wallet/charges
 * Gera o Pix que o cliente final paga à VIA AIR.
 *
 * Camada financeira genérica: não conhece fornecedor, reserva ou produto.
 * Os identificadores de negócio (orderId, bookingId, serviceId) são apenas
 * guardados para conciliação e devolvidos nos avisos.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { comIdempotencia } from "@/lib/api/idempotency.server";

const entrada = z.object({
  amount: z.number().finite().positive().max(1_000_000),
  description: z.string().trim().max(200).optional(),
  orderId: z.string().trim().max(120).optional(),
  bookingId: z.union([z.string(), z.number()]).optional(),
  serviceId: z.union([z.string(), z.number()]).optional(),
  agencyId: z.union([z.string(), z.number()]).optional(),
  callbackUrl: z.string().url().max(400).optional(),
  expiresInMinutes: z.number().int().min(5).max(1440).optional(),
  payer: z.object({
    name: z.string().trim().min(2).max(120),
    documentNumber: z.string().trim().min(11).max(20),
    email: z.string().email().max(160).optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const Route = createFileRoute("/api/public/internal/v1/wallet/charges")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "wallet:charge", async (ctx) =>
          comIdempotencia(
            {
              clientId: ctx.client.id,
              idempotencyKey: ctx.idempotencyKey,
              endpoint: "/wallet/charges",
              body: ctx.body,
              correlationId: ctx.correlationId,
            },
            async () => {
              const parsed = entrada.safeParse(ctx.body);
              if (!parsed.success) {
                return fail(
                  "invalid_request",
                  "Informe amount e os dados do pagador (name, documentNumber).",
                  ctx.correlationId,
                );
              }
              try {
                const { criarCobranca } = await import("@/lib/wallet/charges.server");
                const r = await criarCobranca({
                  apiClientId: ctx.client.id,
                  amount: parsed.data.amount,
                  description: parsed.data.description ?? null,
                  orderId: parsed.data.orderId ?? null,
                  bookingId: parsed.data.bookingId == null ? null : String(parsed.data.bookingId),
                  serviceId: parsed.data.serviceId == null ? null : String(parsed.data.serviceId),
                  agencyId: parsed.data.agencyId == null ? null : String(parsed.data.agencyId),
                  callbackUrl: parsed.data.callbackUrl ?? null,
                  expiresInMinutes: parsed.data.expiresInMinutes ?? null,
                  payer: {
                    name: parsed.data.payer.name,
                    documentNumber: parsed.data.payer.documentNumber,
                    email: parsed.data.payer.email ?? null,
                  },
                  metadata: parsed.data.metadata ?? null,
                });
                return ok({ ...r.charge, reused: r.reused }, ctx.correlationId, r.reused ? 200 : 201);
              } catch (e) {
                return failFromError(e, ctx.correlationId, "asaas");
              }
            },
          ),
        ),
    },
  },
});
