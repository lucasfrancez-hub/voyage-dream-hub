/**
 * POST /api/public/internal/v1/quotes/flight
 *
 * Cria o orçamento aéreo persistido da VIA AIR a partir de identificadores
 * OPACOS (searchId + offerId [+ inboundOfferId]). As chaves do fornecedor
 * (fareKey/searchKey/itineraryId) são resolvidas internamente e NUNCA voltam
 * na resposta.
 *
 * Retorno: { quote_id, public_url } — link compatível com
 * https://pedidos.viaair.tur.br/orcamento/{publicId} e com o fluxo de reserva.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { lerOferta } from "@/lib/api/refs.server";
import type { ApiFlightOffer } from "@/lib/api/normalize";

const opcao = z.object({
  offerId: z.string().min(6).max(60),
  inboundOfferId: z.string().min(6).max(60).nullish(),
  fareIndex: z.number().int().min(0).max(20).nullish(),
  inboundFareIndex: z.number().int().min(0).max(20).nullish(),
});

const entrada = z.object({
  searchId: z.string().min(6).max(60).nullish(),
  /** Novo formato: até 3 opções no MESMO orçamento. Tem prioridade sobre offerId. */
  options: z.array(opcao).min(1).max(3).nullish(),
  offerId: z.string().min(6).max(60).optional(),
  inboundOfferId: z.string().min(6).max(60).nullish(),
  /** Índice da tarifa escolhida dentro de fares[] da própria oferta. */
  fareIndex: z.number().int().min(0).max(20).nullish(),
  inboundFareIndex: z.number().int().min(0).max(20).nullish(),
  agentName: z.string().trim().min(1).max(60).nullish(),
  conversationId: z.string().trim().min(1).max(80).nullish(),
  validUntil: z.string().datetime().nullish(),
});

export const Route = createFileRoute("/api/public/internal/v1/quotes/flight")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "quotes:write", async (ctx) => {
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail("invalid_request", "Informe pelo menos offerId.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          const d = parsed.data;
          const lista = d.options?.length
            ? d.options
            : d.offerId
              ? [
                  {
                    offerId: d.offerId,
                    inboundOfferId: d.inboundOfferId ?? null,
                    fareIndex: d.fareIndex ?? null,
                    inboundFareIndex: d.inboundFareIndex ?? null,
                  },
                ]
              : [];
          if (!lista.length) {
            return fail("invalid_request", "Informe options[] ou offerId.", ctx.correlationId);
          }

          try {
            const { criarOrcamentoAereoDaOferta, criarOrcamentoAereoMultiDaOferta } = await import(
              "@/lib/quotes/from-api-offer.server"
            );

            const resolvidas: Array<{
              outbound: { payload: NonNullable<Awaited<ReturnType<typeof lerOferta>>>; offer: ApiFlightOffer; fareIndex: number | null };
              inbound: { payload: NonNullable<Awaited<ReturnType<typeof lerOferta>>>; offer: ApiFlightOffer; fareIndex: number | null } | null;
            }> = [];

            for (const [i, o] of lista.entries()) {
              const rotulo = lista.length > 1 ? `A oferta ${i + 1}` : "Esta oferta";
              const ida = await lerOferta(o.offerId);
              if (!ida) {
                return fail("not_found", `${rotulo} expirou. Refaça a busca.`, ctx.correlationId);
              }
              const vooIda = (ida.resumo as { voo?: ApiFlightOffer } | null)?.voo;
              if (!vooIda) {
                return fail(
                  "not_found",
                  `${rotulo} é de uma busca antiga e não pode virar orçamento. Refaça a busca.`,
                  ctx.correlationId,
                );
              }

              let inbound: (typeof resolvidas)[number]["inbound"] = null;
              if (o.inboundOfferId) {
                const volta = await lerOferta(o.inboundOfferId);
                if (!volta) {
                  return fail(
                    "not_found",
                    `A volta da opção ${i + 1} expirou. Refaça a busca.`,
                    ctx.correlationId,
                  );
                }
                const vooVolta = (volta.resumo as { voo?: ApiFlightOffer } | null)?.voo;
                if (!vooVolta) {
                  return fail(
                    "not_found",
                    `A volta da opção ${i + 1} é de uma busca antiga. Refaça a busca.`,
                    ctx.correlationId,
                  );
                }
                inbound = { payload: volta, offer: vooVolta, fareIndex: o.inboundFareIndex ?? null };
              }

              resolvidas.push({
                outbound: { payload: ida, offer: vooIda, fareIndex: o.fareIndex ?? null },
                inbound,
              });
            }

            if (resolvidas.length > 1) {
              const r = await criarOrcamentoAereoMultiDaOferta({
                opcoes: resolvidas,
                agentName: d.agentName ?? null,
                conversationId: d.conversationId ?? null,
                validUntil: d.validUntil ?? null,
              });
              return ok(
                {
                  quote_id: r.quote_id,
                  public_id: r.public_id,
                  public_url: r.public_url,
                  short_url: r.short_url,
                  total: r.total,
                  currency: "BRL",
                  options: r.options,
                },
                ctx.correlationId,
              );
            }

            const unica = resolvidas[0]!;
            const r = await criarOrcamentoAereoDaOferta({
              outbound: unica.outbound,
              inbound: unica.inbound,
              agentName: d.agentName ?? null,
              conversationId: d.conversationId ?? null,
              validUntil: d.validUntil ?? null,
            });

            return ok(
              {
                quote_id: r.quote_id,
                public_id: r.public_id,
                public_url: r.public_url,
                short_url: r.short_url,
                total: r.total,
                currency: "BRL",
                options: [{ option_number: 1, total: r.total, currency: "BRL" }],
              },
              ctx.correlationId,
            );
          } catch (e) {
            return fail("internal_error", "DEBUG", ctx.correlationId, {
              details: e instanceof Error ? e.stack : String(e),
            });
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
