/**
 * POST /api/public/internal/v1/multicity/checkouts
 * Cria um checkout independente por perna e agrupa todos sob um groupId.
 * Nada é forçado num único carrinho do fornecedor.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { comIdempotencia } from "@/lib/api/idempotency.server";
import { criarCheckoutRef, lerOferta, novoGroupId } from "@/lib/api/refs.server";
import {
  criarGrupo,
  MULTICITY_MAX_LEGS,
  MULTICITY_MIN_LEGS,
  statusDoGrupo,
} from "@/lib/api/multicity.server";

const entrada = z.object({
  searchId: z.string().trim().min(6).max(60),
  offers: z
    .array(z.object({ sequence: z.number().int().min(1).max(MULTICITY_MAX_LEGS), offerId: z.string().min(6).max(60) }))
    .min(MULTICITY_MIN_LEGS)
    .max(MULTICITY_MAX_LEGS),
});

export const Route = createFileRoute("/api/public/internal/v1/multicity/checkouts")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, ["flights:write", "checkouts:write"], async (ctx) =>
          comIdempotencia(
            {
              clientId: ctx.client.id,
              idempotencyKey: ctx.idempotencyKey,
              endpoint: "/multicity/checkouts",
              body: ctx.body,
              correlationId: ctx.correlationId,
            },
            async () => {
              const parsed = entrada.safeParse(ctx.body);
              if (!parsed.success) {
                return fail(
                  "invalid_request",
                  "Informe o searchId e uma oferta por perna.",
                  ctx.correlationId,
                  { details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
                );
              }
              const escolhas = [...parsed.data.offers].sort((a, b) => a.sequence - b.sequence);
              const sequencias = new Set(escolhas.map((e) => e.sequence));
              if (sequencias.size !== escolhas.length) {
                return fail("invalid_request", "Há mais de uma oferta para a mesma perna.", ctx.correlationId);
              }

              try {
                const { createFlightCart } = await import("@/lib/onertravel.server");
                const groupId = novoGroupId();
                const reservas: Array<Record<string, unknown>> = [];
                const itens: Array<{
                  sequence: number;
                  checkout_id: string | null;
                  order_id: string | null;
                  origin: string;
                  destination: string;
                  departure_date: string | null;
                  amount: number | null;
                  status: string;
                  last_error: string | null;
                }> = [];
                let total = 0;

                for (const escolha of escolhas) {
                  const oferta = await lerOferta(escolha.offerId);
                  if (!oferta) {
                    reservas.push({
                      sequence: escolha.sequence,
                      checkoutId: null,
                      status: "FAILED",
                      error: { code: "not_found", message: "Esta oferta expirou. Refaça a busca." },
                    });
                    itens.push({
                      sequence: escolha.sequence,
                      checkout_id: null,
                      order_id: null,
                      origin: "",
                      destination: "",
                      departure_date: null,
                      amount: null,
                      status: "FAILED",
                      last_error: "Oferta expirada.",
                    });
                    continue;
                  }
                  if (oferta.searchId && oferta.searchId !== parsed.data.searchId) {
                    return fail(
                      "invalid_request",
                      "Uma das ofertas não pertence a esta pesquisa.",
                      ctx.correlationId,
                    );
                  }
                  if (oferta.sequence && oferta.sequence !== escolha.sequence) {
                    return fail(
                      "invalid_request",
                      `A oferta informada é da perna ${oferta.sequence}, não da perna ${escolha.sequence}.`,
                      ctx.correlationId,
                    );
                  }

                  const origem = oferta.contexto.departureIata;
                  const destino = oferta.contexto.arrivalIata;
                  const valor = Number((oferta.resumo as { total?: number }).total ?? 0);
                  try {
                    const carrinho = await createFlightCart({
                      searchKey: oferta.searchKey,
                      outboundFareId: oferta.fareId,
                      outboundItineraryId: oferta.itineraryId,
                      inboundFareId: null,
                      inboundItineraryId: null,
                      isRoundTrip: false,
                      departureIata: origem,
                      arrivalIata: destino,
                      departureDate: oferta.contexto.departureDate,
                      returnDate: null,
                      adults: oferta.contexto.adults,
                      children: oferta.contexto.children,
                      infants: oferta.contexto.infants,
                      departureIsCity: oferta.contexto.departureIsCity ?? false,
                      arrivalIsCity: oferta.contexto.arrivalIsCity ?? false,
                      preferInboundFare: false,
                    } as never);
                    const cartId = (carrinho as { cartId?: string }).cartId ?? "";
                    if (!cartId) throw new Error("O fornecedor não abriu o carrinho desta perna.");

                    const checkoutId = await criarCheckoutRef({
                      clientId: ctx.client.id,
                      cartId,
                      contexto: { ...oferta.contexto, groupId, sequence: escolha.sequence },
                    });
                    total += valor;
                    reservas.push({
                      sequence: escolha.sequence,
                      checkoutId,
                      origin: origem,
                      destination: destino,
                      departureDate: oferta.contexto.departureDate,
                      amount: valor,
                      status: "CREATED",
                      error: null,
                    });
                    itens.push({
                      sequence: escolha.sequence,
                      checkout_id: checkoutId,
                      order_id: null,
                      origin: origem,
                      destination: destino,
                      departure_date: oferta.contexto.departureDate,
                      amount: valor,
                      status: "CREATED",
                      last_error: null,
                    });
                  } catch (e) {
                    const mensagem = e instanceof Error ? e.message : "Falha ao abrir o carrinho.";
                    reservas.push({
                      sequence: escolha.sequence,
                      checkoutId: null,
                      origin: origem,
                      destination: destino,
                      departureDate: oferta.contexto.departureDate,
                      amount: valor,
                      status: "FAILED",
                      error: { code: "provider_error", message: mensagem },
                    });
                    itens.push({
                      sequence: escolha.sequence,
                      checkout_id: null,
                      order_id: null,
                      origin: origem,
                      destination: destino,
                      departure_date: oferta.contexto.departureDate,
                      amount: valor,
                      status: "FAILED",
                      last_error: mensagem.slice(0, 400),
                    });
                  }
                }

                const status = statusDoGrupo(
                  itens.map((i) => ({ status: i.status, checkoutCriado: Boolean(i.checkout_id) })),
                );
                await criarGrupo({
                  groupId,
                  clientId: ctx.client.id,
                  searchId: parsed.data.searchId,
                  status,
                  totalAmount: Number(total.toFixed(2)),
                  itens,
                });

                return ok(
                  {
                    groupId,
                    type: "MULTICITY",
                    status,
                    reservations: reservas,
                    totalAmount: Number(total.toFixed(2)),
                    currency: "BRL",
                  },
                  ctx.correlationId,
                  201,
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
