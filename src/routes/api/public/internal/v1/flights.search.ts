/**
 * POST /api/public/internal/v1/flights/search
 * Busca de ida (e abre a jornada de ida e volta). Devolve ofertas com
 * identificador opaco (offerId) — nunca searchKey/fareId.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { guardarOfertas, novoSearchId, type OfferPayload } from "@/lib/api/refs.server";
import { normalizarVoo } from "@/lib/api/normalize";

const entrada = z.object({
  origin: z.string().trim().length(3),
  destination: z.string().trim().length(3),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(9).default(0),
  infants: z.number().int().min(0).max(9).default(0),
  cabinClass: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]).nullish(),
  checkedBaggage: z.boolean().default(false),
  maxStops: z.number().int().min(0).max(3).nullish(),
  airlines: z.array(z.string().trim().min(2).max(3)).max(20).default([]),
  // Quando não informado, a própria API descobre se o código é de cidade
  // (SAO, RIO...). Mandar cidade como aeroporto devolvia zero voos.
  originIsCity: z.boolean().nullish(),
  destinationIsCity: z.boolean().nullish(),

});

export const Route = createFileRoute("/api/public/internal/v1/flights/search")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "flights:read", async (ctx) => {
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail("invalid_request", "Dados da busca inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          const d = parsed.data;
          try {
            const { searchFlights } = await import("@/lib/onertravel.server");
            const { ehCodigoDeCidade } = await import("@/lib/api/iata.server");
            const origemCidade =
              d.originIsCity ?? (await ehCodigoDeCidade(d.origin, true));
            const destinoCidade =
              d.destinationIsCity ?? (await ehCodigoDeCidade(d.destination, false));
            const resultado = await searchFlights({
              departureIata: d.origin.toUpperCase(),
              arrivalIata: d.destination.toUpperCase(),
              departureDate: d.departureDate,
              returnDate: d.returnDate ?? null,
              adults: d.adults,
              children: d.children,
              infants: d.infants,
              pageSize: 50,
              departureIsCity: origemCidade,
              arrivalIsCity: destinoCidade,

              filters: {
                containsDispatchBaggage: d.checkedBaggage,
                maxStops: d.maxStops ?? null,
                startPrice: null,
                endPrice: null,
                departureFrom: null,
                departureTo: null,
                airlineIatas: d.airlines.map((a) => a.toUpperCase()),
                cabinClass: d.cabinClass ?? null,
              },
            } as never);

            const searchId = novoSearchId();
            const voos = resultado.outbound.flights;
            const contexto = {
              departureIata: d.origin.toUpperCase(),
              arrivalIata: d.destination.toUpperCase(),
              departureDate: d.departureDate,
              returnDate: d.returnDate ?? null,
              adults: d.adults,
              children: d.children,
              infants: d.infants,
              departureIsCity: origemCidade,
              arrivalIsCity: destinoCidade,

            };
            const payloads: OfferPayload[] = voos.map((f) => ({
              searchKey: resultado.searchKey,
              fareId: f.key,
              itineraryId: f.journey.key ?? "",
              leg: "outbound" as const,
              contexto,
              resumo: { total: f.price?.total ?? 0 },
            }));
            const ids = await guardarOfertas({
              clientId: ctx.client.id,
              searchId,
              leg: "outbound",
              ofertas: payloads,
            });

            return ok(
              {
                searchId,
                roundTrip: Boolean(d.returnDate),
                currency: "BRL",
                totalCount: resultado.outbound.totalFlightsCount,
                outbound: voos.map((f, i) => normalizarVoo(f, ids[i] ?? "")),
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
