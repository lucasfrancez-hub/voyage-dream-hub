/**
 * Converte o voo do motor (OnerTravel) no formato de voo do orçamento.
 *
 * Sem isso, os voos salvos na cesta viravam apenas linhas de texto em
 * "Serviços" — e o orçamento não mostrava o bloco aéreo.
 */
import { flightHasBaggage, type OnerFlight, type OnerPlace, type OnerSegment } from "@/lib/onertravel.types";

export type QuoteFlightSegment = {
  airline?: string | null;
  airlineIata?: string | null;
  flightNumber?: string | null;
  fromIata?: string | null;
  fromCity?: string | null;
  toIata?: string | null;
  toCity?: string | null;
  departure?: string | null;
  arrival?: string | null;
  cabin?: string | null;
  baggage?: string | null;
};

export type QuoteFlight = {
  direction?: "OUTBOUND" | "INBOUND" | null;
  airline?: string | null;
  fromIata?: string | null;
  toIata?: string | null;
  departure?: string | null;
  arrival?: string | null;
  duration?: string | null;
  stops?: number | null;
  total?: number | null;
  segments: QuoteFlightSegment[];
};

const p2 = (n: number) => String(n).padStart(2, "0");

/** "2026-12-23T17:05" a partir de data + hora do motor. */
export function placeToIso(place?: OnerPlace | null): string | null {
  if (!place?.date) return null;
  const { year, month, day } = place.date;
  const h = place.time?.hour ?? 0;
  const m = place.time?.minute ?? 0;
  return `${year}-${p2(month)}-${p2(day)}T${p2(h)}:${p2(m)}`;
}

function segmentToQuote(s: OnerSegment, bagagem: boolean): QuoteFlightSegment {
  return {
    airline: s.marketingAirline?.name?.trim() ?? null,
    airlineIata: s.marketingAirline?.iata ?? null,
    flightNumber: `${s.marketingAirline?.iata ?? ""} ${s.flightNumber ?? ""}`.trim() || null,
    fromIata: s.departure?.iata ?? null,
    fromCity: s.departure?.city ?? null,
    toIata: s.destination?.iata ?? null,
    toCity: s.destination?.city ?? null,
    departure: placeToIso(s.departure),
    arrival: placeToIso(s.destination),
    cabin: s.cabinClass ?? null,
    baggage: bagagem ? "1 bagagem despachada" : "Somente bagagem de mão",
  };
}

export function onerToQuoteFlight(
  f: OnerFlight,
  direction: "OUTBOUND" | "INBOUND" | null = null,
): QuoteFlight {
  const j = f.journey;
  const bagagem = flightHasBaggage(f);
  const cia =
    j.marketingAirline?.name?.trim() || j.segments?.[0]?.marketingAirline?.name?.trim() || null;
  return {
    direction,
    airline: cia,
    fromIata: j.departure?.iata ?? null,
    toIata: j.destination?.iata ?? null,
    departure: placeToIso(j.departure),
    arrival: placeToIso(j.destination),
    duration: j.flyingTime ? `${j.flyingTime.hour}H ${p2(j.flyingTime.minute)}M` : null,
    stops: j.numberOfStops ?? null,
    total: f.price?.total ?? null,
    segments: (j.segments ?? []).map((s) => segmentToQuote(s, bagagem)),
  };
}
