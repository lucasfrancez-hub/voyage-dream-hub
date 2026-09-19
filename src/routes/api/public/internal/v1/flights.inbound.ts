/**
 * POST /api/public/internal/v1/flights/inbound
 * Voos de volta combináveis com a ida escolhida.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { guardarOfertas, lerOferta, type OfferPayload } from "@/lib/api/refs.server";
import { normalizarVoo } from "@/lib/api/normalize";

const entrada = z.object({
  searchId: z.string().min(6).max(60),
  outboundOfferId: z.string().min(6).max(60),
});

export const Route = createFileRoute("/api/public/internal/v1/flights/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "flights:read", async (ctx) => {
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail("invalid_request", "Informe searchId e outboundOfferId.", ctx.correlationId);
          }
          const oferta = await lerOferta(parsed.data.outboundOfferId);
          if (!oferta) {
            return fail("not_found", "Esta oferta de ida expirou. Refaça a busca.", ctx.correlationId);
          }
          if (!oferta.contexto.returnDate) {
            return fail("invalid_request", "Esta busca não é de ida e volta.", ctx.correlationId);
          }
          try {
            const { searchInboundFlights } = await import("@/lib/onertravel.server");
            const { carregarMarkups } = await import("@/lib/api/installment-plan.server");
            const markups = await carregarMarkups();
            const volta = await searchInboundFlights({
              departureIata: oferta.contexto.departureIata,
              arrivalIata: oferta.contexto.arrivalIata,
              departureDate: oferta.contexto.departureDate,
              returnDate: oferta.contexto.returnDate,
              adults: oferta.contexto.adults,
              children: oferta.contexto.children,
              infants: oferta.contexto.infants,
              pageSize: 50,
              departureIsCity: oferta.contexto.departureIsCity ?? false,
              arrivalIsCity: oferta.contexto.arrivalIsCity ?? false,
              searchKey: oferta.searchKey,
              flightKey: oferta.fareId,
              // Reaplica os filtros da busca de ida (salvos no contexto do
              // searchId). Buscas antigas sem esses campos caem nos defaults
              // anteriores: sem bagagem, sem restrição de paradas/companhias.
              filters: {
                containsDispatchBaggage: oferta.contexto.checkedBaggage ?? false,
                maxStops: oferta.contexto.maxStops ?? null,
                startPrice: null,
                endPrice: null,
                departureFrom: null,
                departureTo: null,
                airlineIatas: oferta.contexto.airlines ?? [],
                cabinClass: oferta.contexto.cabinClass ?? null,
              },
            } as never);

            const payloads: OfferPayload[] = volta.flights.map((f) => ({
              searchKey: oferta.searchKey,
              fareId: f.key,
              itineraryId: f.journey.key ?? "",
              leg: "inbound" as const,
              contexto: oferta.contexto,
              resumo: {
                total: f.price?.total ?? 0,
                outboundOfferId: parsed.data.outboundOfferId,
                voo: normalizarVoo(f, "", markups),
              },
            }));
            const ids = await guardarOfertas({
              clientId: ctx.client.id,
              searchId: parsed.data.searchId,
              leg: "inbound",
              ofertas: payloads,
            });

            return ok(
              {
                searchId: parsed.data.searchId,
                outboundOfferId: parsed.data.outboundOfferId,
                totalCount: volta.totalFlightsCount,
                inbound: volta.flights.map((f, i) => normalizarVoo(f, ids[i] ?? "", markups)),
              },
              ctx.correlationId,
            );
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
