/**
 * POST /api/public/internal/v1/multicity/groups/{groupId}/revalidate
 * Revalida o preço de cada perna. Basta uma mudar para o grupo deixar de
 * ser totalmente válido.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { comIdempotencia } from "@/lib/api/idempotency.server";
import { lerCheckoutRef } from "@/lib/api/refs.server";
import { atualizarGrupo, atualizarItem, lerGrupo } from "@/lib/api/multicity.server";

const entrada = z.object({
  reservations: z
    .array(
      z.object({
        sequence: z.number().int().min(1).max(6),
        expectedAmount: z.number().finite().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(6)
    .nullish(),
});

export const Route = createFileRoute(
  "/api/public/internal/v1/multicity/groups/$groupId/revalidate",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, "checkouts:write", async (ctx) =>
          comIdempotencia(
            {
              clientId: ctx.client.id,
              idempotencyKey: ctx.idempotencyKey,
              endpoint: `/multicity/groups/${params.groupId}/revalidate`,
              body: ctx.body,
              correlationId: ctx.correlationId,
            },
            async () => {
              const grupo = await lerGrupo(params.groupId, ctx.client.id);
              if (!grupo) return fail("not_found", "Grupo não encontrado.", ctx.correlationId);
              const parsed = entrada.safeParse(ctx.body ?? {});
              if (!parsed.success) {
                return fail("invalid_request", "Dados da revalidação inválidos.", ctx.correlationId, {
                  details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
                });
              }
              const esperados = new Map(
                (parsed.data.reservations ?? []).map((r) => [r.sequence, r.expectedAmount]),
              );

              try {
                const { sessaoDeCompra } = await import("@/lib/api/oner-session.server");
                const { revalidarPreco } = await import("@/lib/integrations/oner/checkout.server");
                const sessao = await sessaoDeCompra(ctx.correlationId, { groupId: params.groupId });
                if ("falha" in sessao) return sessao.falha;
                const token = sessao.token;

                const reservas = [];
                let previousTotal = 0;
                let currentTotal = 0;

                for (const item of grupo.itens) {
                  const anterior = esperados.get(item.sequence) ?? Number(item.amount ?? 0);
                  previousTotal += anterior;
                  if (!item.checkout_id || !anterior) {
                    reservas.push({
                      sequence: item.sequence,
                      checkoutId: item.checkout_id,
                      status: "UNAVAILABLE",
                      previousAmount: anterior || null,
                      currentAmount: null,
                    });
                    continue;
                  }
                  const ref = await lerCheckoutRef(item.checkout_id);
                  if (!ref) {
                    reservas.push({
                      sequence: item.sequence,
                      checkoutId: item.checkout_id,
                      status: "UNAVAILABLE",
                      previousAmount: anterior,
                      currentAmount: null,
                    });
                    continue;
                  }
                  const r = await revalidarPreco(ref.cartId, token, anterior);
                  if (r.expirado) {
                    reservas.push({
                      sequence: item.sequence,
                      checkoutId: item.checkout_id,
                      status: "UNAVAILABLE",
                      previousAmount: anterior,
                      currentAmount: null,
                    });
                    continue;
                  }
                  const atual = Number(r.valorAtual ?? anterior);
                  currentTotal += atual;
                  const status = r.mudou ? "PRICE_CHANGED" : "VALID";
                  await atualizarItem(grupo.group_id, item.sequence, { amount: atual });
                  reservas.push({
                    sequence: item.sequence,
                    checkoutId: item.checkout_id,
                    status,
                    previousAmount: anterior,
                    currentAmount: atual,
                  });
                }

                const status = reservas.every((r) => r.status === "VALID")
                  ? "VALID"
                  : reservas.some((r) => r.status === "UNAVAILABLE")
                    ? "UNAVAILABLE"
                    : "PRICE_CHANGED";
                await atualizarGrupo(grupo.group_id, {
                  total_amount: Number(currentTotal.toFixed(2)),
                });

                return ok(
                  {
                    groupId: grupo.group_id,
                    status,
                    reservations: reservas,
                    previousTotal: Number(previousTotal.toFixed(2)),
                    currentTotal: Number(currentTotal.toFixed(2)),
                  },
                  ctx.correlationId,
                );
              } catch (e) {
                return failFromError(e, ctx.correlationId);
              }
            },
          ),
        ),
    },
  },
});
