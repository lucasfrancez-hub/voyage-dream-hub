/**
 * POST /api/public/internal/v1/flights/multicity/search
 * Multitrecho: uma pesquisa só-ida por perna, na ordem informada.
 * As ofertas de cada perna nunca se misturam e cada uma tem seu offerId opaco.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { guardarOfertas, novoSearchIdMulticity, type OfferPayload } from "@/lib/api/refs.server";
import { normalizarVoo } from "@/lib/api/normalize";
import { MULTICITY_MAX_LEGS, validarPernas } from "@/lib/api/multicity.server";

const perna = z.object({
  origin: z.string().trim().length(3),
  destination: z.string().trim().length(3),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  originIsCity: z.boolean().default(false),
  destinationIsCity: z.boolean().default(false),
});

const entrada = z.object({
  legs: z.array(perna).min(1).max(MULTICITY_MAX_LEGS),
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(9).default(0),
  infants: z.number().int().min(0).max(9).default(0),
  cabinClass: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]).nullish(),
  checkedBaggage: z.boolean().default(false),
  maxStops: z.number().int().min(0).max(3).nullish(),
  airlines: z.array(z.string().trim().min(2).max(3)).max(20).default([]),
});

export const Route = createFileRoute("/api/public/internal/v1/flights/multicity/search")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, "flights:read", async (ctx) => {
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail("invalid_request", "Dados da busca multitrecho inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          const d = parsed.data;
          const erros = validarPernas(d.legs);
          if (erros.length) {
            return fail("invalid_request", "Pernas inválidas.", ctx.correlationId, { details: erros });
          }

          const { searchFlights } = await import("@/lib/onertravel.server");
          const searchId = novoSearchIdMulticity();
          const legs: Array<Record<string, unknown>> = [];

          for (let i = 0; i < d.legs.length; i += 1) {
            const l = d.legs[i]!;
            const origin = l.origin.toUpperCase();
            const destination = l.destination.toUpperCase();
            const sequence = i + 1;
            const base = {
              sequence,
              origin,
              destination,
              departureDate: l.departureDate,
            };
            try {
              const resultado = await searchFlights({
                departureIata: origin,
                arrivalIata: destination,
                departureDate: l.departureDate,
                returnDate: null,
                adults: d.adults,
                children: d.children,
                infants: d.infants,
                pageSize: 50,
                departureIsCity: l.originIsCity,
                arrivalIsCity: l.destinationIsCity,
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

              const voos = resultado.outbound.flights;
              const contexto = {
                departureIata: origin,
                arrivalIata: destination,
                departureDate: l.departureDate,
                returnDate: null,
                adults: d.adults,
                children: d.children,
                infants: d.infants,
                departureIsCity: l.originIsCity,
                arrivalIsCity: l.destinationIsCity,
              };
              const payloads: OfferPayload[] = voos.map((f) => ({
                searchKey: resultado.searchKey,
                fareId: f.key,
                itineraryId: f.journey.key ?? "",
                leg: "outbound" as const,
                sequence,
                searchId,
                contexto,
                resumo: { total: f.price?.total ?? 0 },
              }));
              const ids = await guardarOfertas({
                clientId: ctx.client.id,
                searchId,
                leg: "outbound",
                ofertas: payloads,
              });
              legs.push({
                ...base,
                totalCount: resultado.outbound.totalFlightsCount,
                offers: voos.map((f, k) => normalizarVoo(f, ids[k] ?? "")),
                error: null,
              });
            } catch (e) {
              // A falha de uma perna aparece: não escondemos nem abortamos as demais.
              legs.push({
                ...base,
                totalCount: 0,
                offers: [],
                error: {
                  code: "provider_error",
                  message: e instanceof Error ? e.message : "Falha na pesquisa desta perna.",
                },
              });
            }
          }

          try {
            return ok(
              {
                searchId,
                type: "MULTICITY",
                currency: "BRL",
                passengers: { adults: d.adults, children: d.children, infants: d.infants },
                legs,
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
