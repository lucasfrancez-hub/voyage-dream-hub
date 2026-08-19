/**
 * DETALHES DE VOO DA PROMOÇÃO (número do voo, horários, duração, conexões).
 *
 * O motor devolve esses dados na pesquisa, mas eles não têm coluna própria em
 * `airfare_promotions`. Guardamos em `raw.flights` e, para promoções antigas
 * (salvas antes desta gravação), buscamos de novo no motor na hora de gerar o
 * orçamento público — assim o cliente nunca vê o voo "zerado" (— —).
 */
import { flightHasBaggage, type OnerFlight, type OnerPlace } from "@/lib/onertravel.types";

export type PromoFlightDetail = {
  direction: "OUTBOUND" | "INBOUND";
  date: string;
  fromIata: string;
  toIata: string;
  airlineIata: string;
  flightNumber?: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: string;
  stops: number;
  checkedBaggage: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

const dateOf = (p?: OnerPlace): string =>
  p?.date ? `${p.date.year}-${pad(p.date.month)}-${pad(p.date.day)}` : "";

const timeOf = (p?: OnerPlace): string =>
  p?.time ? `${pad(p.time.hour)}:${pad(p.time.minute)}` : "";

/** Converte o voo do motor no formato de trecho usado no orçamento público. */
export function flightToDetail(
  f: OnerFlight,
  direction: "OUTBOUND" | "INBOUND",
  fallbackDate: string,
): PromoFlightDetail {
  const segs = f.journey?.segments ?? [];
  const first = segs[0];
  const last = segs[segs.length - 1];
  const partida = f.journey?.departure ?? first?.departure;
  const chegada = f.journey?.destination ?? last?.destination;
  const ft = f.journey?.flyingTime;
  return {
    direction,
    date: dateOf(partida) || fallbackDate,
    fromIata: (partida?.iata ?? "").toUpperCase(),
    toIata: (chegada?.iata ?? "").toUpperCase(),
    airlineIata: (
      f.journey?.marketingAirline?.iata ??
      first?.marketingAirline?.iata ??
      ""
    ).toUpperCase(),
    flightNumber: segs
      .map((s) => `${s.marketingAirline?.iata ?? ""}${s.flightNumber ?? ""}`.trim())
      .filter(Boolean)
      .join(" + "),
    departureTime: timeOf(partida),
    arrivalTime: timeOf(chegada),
    duration: ft ? `${ft.hour}h${ft.minute ? pad(ft.minute) : ""}` : undefined,
    stops: f.journey?.numberOfStops ?? Math.max(0, segs.length - 1),
    checkedBaggage: flightHasBaggage(f),
  };
}

type PromoLike = {
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string | null;
  passengers: number | null;
  airline_iata: string | null;
  inbound_airline_iata?: string | null;
  outbound_fare_id?: string | null;
  outbound_itinerary_id?: string | null;
  inbound_fare_id?: string | null;
  inbound_itinerary_id?: string | null;
};

function escolher(
  flights: OnerFlight[],
  fareId: string | null | undefined,
  itineraryId: string | null | undefined,
  airline: string | null | undefined,
): OnerFlight | null {
  if (!flights.length) return null;
  const porChave =
    flights.find((f) => fareId && f.key === fareId) ??
    flights.find((f) => itineraryId && f.journey?.key === itineraryId) ??
    flights.find((f) => fareId && (f.altKeys ?? []).includes(fareId));
  if (porChave) return porChave;
  const cia = (airline ?? "").toUpperCase();
  const mesmaCia = cia
    ? flights.filter((f) => (f.journey?.marketingAirline?.iata ?? "").toUpperCase() === cia)
    : [];
  const lista = mesmaCia.length ? mesmaCia : flights;
  return [...lista].sort((a, b) => (a.price?.total ?? 0) - (b.price?.total ?? 0))[0] ?? null;
}

/**
 * Refaz a pesquisa no motor e devolve os trechos reais da promoção.
 * Nunca lança: se o motor falhar, devolve `null` e o orçamento usa o resumo.
 */
export async function fetchPromoFlightDetails(
  promo: PromoLike,
): Promise<PromoFlightDetail[] | null> {
  try {
    const { searchFlights, searchInboundFlights } = await import("@/lib/onertravel.server");
    const { isMetroCode } = await import("@/lib/iata-lookup");
    const base = {
        departureIata: promo.origin_iata,
        arrivalIata: promo.destination_iata,
        departureDate: promo.departure_date,
        returnDate: promo.return_date,
        adults: promo.passengers || 1,
        children: 0,
        infants: 0,
        pageSize: 20,
        departureIsCity: isMetroCode(promo.origin_iata),
        arrivalIsCity: isMetroCode(promo.destination_iata),
        filters: {
          containsDispatchBaggage: false,
          maxStops: 2,
          startPrice: null,
          endPrice: null,
          departureFrom: null,
          departureTo: null,
          airlineIatas: [],
          cabinClass: null,
        },
    };
    const res = (await searchFlights({ ...base, returnDate: promo.return_date } as never, "normal")) as {
      searchKey?: string;
      outbound?: { flights?: OnerFlight[] };
      inbound?: { flights?: OnerFlight[] } | null;
    };

    const out = escolher(
      res.outbound?.flights ?? [],
      promo.outbound_fare_id,
      promo.outbound_itinerary_id,
      promo.airline_iata,
    );
    if (!out) return null;
    const detalhes: PromoFlightDetail[] = [flightToDetail(out, "OUTBOUND", promo.departure_date)];

    if (promo.return_date) {
      let voltas = res.inbound?.flights ?? [];
      if (!voltas.length && res.searchKey) {
        // a volta só aparece depois de escolher a ida
        const r = (await searchInboundFlights(
          {
            ...base,
            returnDate: promo.return_date,
            searchKey: res.searchKey,
            flightKey: out.key,
          } as never,
          "normal",
        ).catch(() => null)) as { flights?: OnerFlight[] } | null;
        voltas = r?.flights ?? [];
      }
      const inb = escolher(
        voltas,
        promo.inbound_fare_id,
        promo.inbound_itinerary_id,
        promo.inbound_airline_iata ?? promo.airline_iata,
      );
      if (inb) detalhes.push(flightToDetail(inb, "INBOUND", promo.return_date));
    }
    return detalhes;
  } catch {
    return null;
  }
}
