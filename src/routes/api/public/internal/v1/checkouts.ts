/**
 * POST /api/public/internal/v1/checkouts
 * Transforma a oferta escolhida em carrinho no fornecedor e devolve o
 * checkoutId opaco usado por quem consome a API.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { comIdempotencia } from "@/lib/api/idempotency.server";
import { criarCheckoutRef, lerOferta } from "@/lib/api/refs.server";

const entrada = z.object({
  offerId: z.string().min(6).max(60),
  inboundOfferId: z.string().min(6).max(60).nullish(),
});

export const Route = createFileRoute("/api/public/internal/v1/checkouts")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, ["flights:write", "checkouts:write"], async (ctx) =>
          comIdempotencia(
            {
              clientId: ctx.client.id,
              idempotencyKey: ctx.idempotencyKey,
              endpoint: "/checkouts",
              body: ctx.body,
              correlationId: ctx.correlationId,
            },
            async () => {
              const parsed = entrada.safeParse(ctx.body);
              if (!parsed.success) {
                return fail("invalid_request", "Informe o offerId da ida.", ctx.correlationId);
              }
              const ida = await lerOferta(parsed.data.offerId);
              if (!ida) {
                return fail("not_found", "Esta oferta expirou. Refaça a busca.", ctx.correlationId);
              }
              const volta = parsed.data.inboundOfferId
                ? await lerOferta(parsed.data.inboundOfferId)
                : null;
              if (parsed.data.inboundOfferId && !volta) {
                return fail("not_found", "A oferta de volta expirou.", ctx.correlationId);
              }
              try {
                const { createFlightCart } = await import("@/lib/onertravel.server");
                const carrinho = await createFlightCart({
                  searchKey: ida.searchKey,
                  outboundFareId: ida.fareId,
                  outboundItineraryId: ida.itineraryId,
                  inboundFareId: volta?.fareId ?? null,
                  inboundItineraryId: volta?.itineraryId ?? null,
                  isRoundTrip: Boolean(volta),
                  departureIata: ida.contexto.departureIata,
                  arrivalIata: ida.contexto.arrivalIata,
                  departureDate: ida.contexto.departureDate,
                  returnDate: ida.contexto.returnDate ?? null,
                  adults: ida.contexto.adults,
                  children: ida.contexto.children,
                  infants: ida.contexto.infants,
                  departureIsCity: ida.contexto.departureIsCity ?? false,
                  arrivalIsCity: ida.contexto.arrivalIsCity ?? false,
                  preferInboundFare: false,
                } as never);

                const cartId = (carrinho as { cartId?: string }).cartId ?? "";
                if (!cartId) {
                  return fail(
                    "provider_error",
                    "O fornecedor não conseguiu abrir o carrinho desta oferta.",
                    ctx.correlationId,
                    { provider: "oner" },
                  );
                }
                const checkoutId = await criarCheckoutRef({
                  clientId: ctx.client.id,
                  cartId,
                  contexto: { ...ida.contexto },
                });
                return ok(
                  {
                    checkoutId,
                    status: "CREATED",
                    roundTrip: Boolean(volta),
                    createdAt: new Date().toISOString(),
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
