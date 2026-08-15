/**
 * Converte um Orçamento Via Air importado (com N opções) no orçamento

 * público oficial — UM único link contendo TODAS as opções.
 * SERVER-ONLY.
 */
import { cityLabel } from "@/lib/iata-lookup";
import { findAirline } from "@/lib/airlines";
import { buildPayment } from "@/lib/public-quote/payments";
import {
  directionsFor,
  durationBetween,
  isTrocaDeAeroporto,
  legLabel,
  splitIntoLegs,
  type LegInputSegment,
} from "@/lib/public-quote/flight-legs";
import { normalizeServiceTitle } from "@/lib/public-quote/service-title";
import { agentPhoto } from "@/lib/public-quote/agents";
import { formatRoom } from "@/lib/public-quote/room-label";
import { collectBaggageText, parseBaggage } from "./baggage";

import type {
  FlightLeg,
  FlightSegment,
  PublicQuote,
  QuoteOption,
  QuoteProducts,
  QuoteSummaryLine,
  QuoteTotals,
  QuoteType,
  SimpleProduct,
} from "@/lib/public-quote/types";
import type { NormalizedOption, NormalizedQuote, NormalizedGenericItem } from "./types";
import { optionProductKinds } from "./types";

function brl(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function timeOf(stamp?: string | null): string {
  if (!stamp) return "—";
  const m = String(stamp).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "—";
}

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dateLabel(stamp?: string | null): string {
  if (!stamp) return "—";
  const m = String(stamp).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(stamp);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

function brDate(stamp?: string | null): string | null {
  if (!stamp) return null;
  const m = String(stamp).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : String(stamp);
}

function toSegments(flight: NormalizedOption["flights"][number]): FlightSegment[] {
  if (flight.segments?.length) {
    return flight.segments.map((s) => ({
      airline: s.airline ?? findAirline(s.airlineIata ?? "")?.name ?? "Companhia aérea",
      airlineIata: s.airlineIata ?? null,
      flightNumber: s.flightNumber ?? null,
      fromIata: s.fromIata ?? flight.fromIata ?? "",
      fromName: cityLabel(s.fromIata ?? "") || null,
      toIata: s.toIata ?? flight.toIata ?? "",
      toName: cityLabel(s.toIata ?? "") || null,
      departure: s.departure ?? flight.departure ?? "",
      arrival: s.arrival ?? flight.arrival ?? "",
      duration: s.duration ?? flight.duration ?? null,
      aircraft: s.aircraft ?? null,
    }));
  }
  return [
    {
      airline: flight.airline ?? "Companhia aérea",
      fromIata: flight.fromIata ?? "",
      toIata: flight.toIata ?? "",
      departure: flight.departure ?? "",
      arrival: flight.arrival ?? "",
      duration: flight.duration ?? null,
    },
  ];
}

function toLeg(flight: NormalizedOption["flights"][number], index: number): FlightLeg {
  const stops = Math.max(0, Number(flight.stops) || Math.max(0, (flight.segments?.length ?? 1) - 1));
  const direction: "OUTBOUND" | "INBOUND" = flight.direction ?? (index === 0 ? "OUTBOUND" : "INBOUND");
  const baggageText =
    collectBaggageText(...(flight.segments ?? []).map((s) => s.baggage), (flight as any).baggage) ?? null;
  const bags = parseBaggage(baggageText);
  return {
    direction,
    label: direction === "OUTBOUND" ? "Voo de ida" : "Voo de volta",
    airline: flight.airline ?? flight.segments?.[0]?.airline ?? "Companhia aérea",
    airlineIata: flight.segments?.[0]?.airlineIata ?? null,
    dateLabel: dateLabel(flight.departure),
    departureTime: timeOf(flight.departure),
    arrivalTime: timeOf(flight.arrival),
    fromIata: flight.fromIata ?? "",
    fromCity: cityLabel(flight.fromIata ?? "") || null,
    toIata: flight.toIata ?? "",
    toCity: cityLabel(flight.toIata ?? "") || null,
    duration: flight.duration ?? null,
    stops,
    stopsLabel: stops === 0 ? "Direto" : stops === 1 ? "1 conexão" : `${stops} conexões`,
    cabin: flight.segments?.[0]?.cabin ?? null,
    carryOn: bags.carryOn,
    personalItem: bags.personalItem,
    checkedBaggage: bags.checkedBaggage,
    checkedBaggageLabel: bags.checkedBaggage
      ? `${bags.checkedPieces ?? 1}x bagagem despachada${bags.checkedWeightKg ? ` (${bags.checkedWeightKg}kg)` : ""}`
      : null,
    segments: toSegments(flight),
  };
}

/**
 * Marca espera de conexão e troca de aeroporto entre segmentos do mesmo trecho.
 * Sem isso o alerta "Atenção: troca de aeroporto" não aparecia nos orçamentos
 * importados (só nos gerados a partir de pedidos).
 */
function annotateConnections(segments: FlightSegment[]): boolean {
  let troca = false;
  for (let i = 0; i < segments.length - 1; i++) {
    const atual = segments[i]!;
    const proximo = segments[i + 1]!;
    const espera = durationBetween(atual.arrival, proximo.departure);
    atual.connectionAfter = espera ?? null;
    if (isTrocaDeAeroporto(atual.toIata, proximo.fromIata)) {
      troca = true;
      atual.airportChange =
        `Desembarque em ${atual.toIata}${atual.toName ? ` (${atual.toName})` : ""} e embarque em ${proximo.fromIata}${proximo.fromName ? ` (${proximo.fromName})` : ""}`;
    } else {
      atual.airportChange = null;
    }
  }
  return troca;
}

/**
 * Um card por trecho real. Nunca une ida com volta: quando os segmentos de
 * um mesmo objeto não se conectam (aeroporto diferente ou espera > 12h),
 * eles viram trechos separados.
 */
function buildOptionLegs(flights: NormalizedOption["flights"]): FlightLeg[] {
  const out: FlightLeg[] = [];

  flights.forEach((flight, index) => {
    const base = toLeg(flight, index);
    const segs = base.segments;
    base.hasAirportChange = annotateConnections(segs);
    if (segs.length < 2) {
      out.push(base);
      return;
    }
    const input: LegInputSegment[] = segs.map((s) => ({
      airline: s.airline,
      airlineIata: s.airlineIata ?? null,
      flightNumber: s.flightNumber ?? null,
      fromIata: s.fromIata,
      fromName: s.fromName ?? null,
      toIata: s.toIata,
      toName: s.toName ?? null,
      departure: s.departure,
      arrival: s.arrival,
      aircraft: s.aircraft ?? null,
      direction: base.direction,
    }));
    const grupos = splitIntoLegs(input);
    if (grupos.length < 2) {
      out.push(base);
      return;
    }
    const direcoes = directionsFor(grupos);
    grupos.forEach((grupo, gi) => {
      const first = grupo[0]!;
      const last = grupo[grupo.length - 1]!;
      const selecionados = segs.filter((s) =>
        grupo.some((g) => g.fromIata === s.fromIata && g.departure === s.departure),
      );
      const stops = Math.max(0, grupo.length - 1);
      const direction = direcoes[gi]!;
      out.push({
        ...base,
        direction,
        label: legLabel(direction, gi, grupos.length),
        dateLabel: dateLabel(first.departure),
        departureTime: timeOf(first.departure),
        arrivalTime: timeOf(last.arrival),
        fromIata: first.fromIata,
        fromCity: cityLabel(first.fromIata) || null,
        toIata: last.toIata,
        toCity: cityLabel(last.toIata) || null,
        duration: null,
        stops,
        stopsLabel: stops === 0 ? "Direto" : stops === 1 ? "1 conexão" : `${stops} conexões`,
        segments: selecionados.length ? selecionados : segs,
      });
    });
  });

  return out;
}

function simple(items: NormalizedGenericItem[], prefix: string): SimpleProduct[] {
  return items.map((i, idx) => ({
    id: `${prefix}-${idx + 1}`,
    title: normalizeServiceTitle(i.name).title,
    summary: i.date ? brDate(i.date) : null,
    details: [
      ...(i.quantity ? [{ label: "Quantidade", value: String(i.quantity) }] : []),
      ...(i.total ? [{ label: "Valor", value: brl(i.total) }] : []),
    ],
    description: i.description ?? null,
  }));
}

export function optionToProducts(option: NormalizedOption, occupancy?: string | null): QuoteProducts {
  const products: QuoteProducts = {};

  if (option.flights.length) {
    products.flights = [
      {
        id: `opt-${option.optionNumber}-air`,
        optionId: String(option.optionNumber),
        legs: buildOptionLegs(option.flights),
      },
    ];
  }
  if (option.hotels.length) {
    products.hotels = option.hotels.map((h, idx) => ({
      id: `opt-${option.optionNumber}-hotel-${idx + 1}`,
      name: h.name,
      stars: null,
      place: h.city ?? null,
      photos: h.photos ?? [],
      checkIn: brDate(h.checkin),
      checkOut: brDate(h.checkout),
      occupancy: occupancy ?? null,
      mealPlan: h.board ?? null,
      benefits: h.board ? [h.board] : [],
      roomName: formatRoom(h.roomDescription).name,
      roomDescription: formatRoom(h.roomDescription).description,
      location:
        h.latitude != null || h.address
          ? {
              latitude: h.latitude ?? null,
              longitude: h.longitude ?? null,
              address: h.address ?? null,
              nearbyPlaces: [],
            }
          : null,
      mapsUrl:
        h.latitude != null && h.longitude != null
          ? `https://www.google.com/maps/search/?api=1&query=${h.latitude},${h.longitude}`
          : h.address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name} ${h.address}`)}`
            : null,
    }));
  }
  if (option.cars.length) products.cars = simple(option.cars, `opt-${option.optionNumber}-car`);
  if (option.transfers.length) products.transfers = simple(option.transfers, `opt-${option.optionNumber}-tr`);
  if (option.activities.length) products.activities = simple(option.activities, `opt-${option.optionNumber}-act`);
  if (option.tickets.length) products.tickets = simple(option.tickets, `opt-${option.optionNumber}-tk`);
  if (option.insurance.length) products.insurance = simple(option.insurance, `opt-${option.optionNumber}-ins`);
  if (option.services.length) products.services = simple(option.services, `opt-${option.optionNumber}-srv`);

  return products;
}

export function optionSummary(option: NormalizedOption): QuoteSummaryLine[] {
  const out: QuoteSummaryLine[] = [];
  const add = (icon: QuoteSummaryLine["icon"], label: string, value: string) => out.push({ icon, label, value });
  if (option.flights.length) add("flight", "Passagens aéreas", `${option.flights.length} trecho(s)`);
  for (const h of option.hotels) {
    add("hotel", h.name, [brDate(h.checkin), brDate(h.checkout)].filter(Boolean).join(" → ") || "Hospedagem");
  }
  if (option.cars.length) add("car", "Aluguel de carro", `${option.cars.length} item(ns)`);
  if (option.transfers.length) add("transfer", "Transfer", `${option.transfers.length} item(ns)`);
  if (option.activities.length) add("activity", "Passeios", `${option.activities.length} item(ns)`);
  if (option.tickets.length) add("ticket", "Ingressos", `${option.tickets.length} item(ns)`);
  if (option.insurance.length) add("insurance", "Seguro viagem", `${option.insurance.length} item(ns)`);
  if (option.services.length) add("service", "Serviços", `${option.services.length} item(ns)`);
  return out;
}

function optionType(option: NormalizedOption): QuoteType {
  const kinds = optionProductKinds(option);
  return kinds.length === 1 && kinds[0] === "flights" ? "AIR_ONLY" : "TRIP_PACKAGE";
}

function totalsFor(option: NormalizedOption, payment: ReturnType<typeof buildPayment>): QuoteTotals {
  const total = Number(option.total) || 0;
  return { products: total, taxes: 0, total, pixTotal: payment.pix.total };
}

export function optionToPublicOption(
  option: NormalizedOption,
  occupancy?: string | null,
  startDate?: string | null,
): QuoteOption {
  const type = optionType(option);
  const total = Number(option.total) || 0;
  const airline = option.flights[0]?.airline ?? option.flights[0]?.segments?.[0]?.airlineIata ?? null;
  const payment = buildPayment({
    type,
    total,
    airline,
    startDate: startDate ?? option.startDate ?? null,
  });
  return {
    optionId: String(option.optionNumber),
    label: option.label ?? `Opção ${option.optionNumber}`,
    products: optionToProducts(option, occupancy),
    totals: totalsFor(option, payment),
    payment,
    summary: optionSummary(option),
  };
}

/** Monta o DTO público do orçamento com TODAS as opções agrupadas. */
export function buildPublicQuoteFromImported(params: {
  normalized: NormalizedQuote;
  title?: string | null;
  clientName?: string | null;
  agentName?: string | null;
  validUntil?: string | null;
}): Omit<PublicQuote, "id" | "publicId" | "createdAt" | "updatedAt" | "expired" | "shortUrl"> {
  const { normalized } = params;
  const options = normalized.options.length ? normalized.options : [];

  const adultos = Math.max(1, Number(normalized.passengers?.adults ?? 1) || 1);
  const criancas = Math.max(0, Number(normalized.passengers?.children ?? 0) || 0);
  const bebes = Math.max(0, Number(normalized.passengers?.infants ?? 0) || 0);
  const paxLabel = [
    `${adultos} ${adultos === 1 ? "adulto" : "adultos"}`,
    criancas ? `${criancas} ${criancas === 1 ? "criança" : "crianças"}` : null,
    bebes ? `${bebes} ${bebes === 1 ? "bebê" : "bebês"}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const inicio = normalized.startDate ?? options[0]?.startDate ?? null;
  const publicOptions = options.map((o) => optionToPublicOption(o, paxLabel, inicio));
  const first = publicOptions[0];

  const anyPackage = options.some((o) => optionType(o) === "TRIP_PACKAGE");
  const type: QuoteType = anyPackage ? "TRIP_PACKAGE" : "AIR_ONLY";

  const destino = normalized.destination ?? options[0]?.destination ?? "Sua viagem";
  const title = params.title ?? (normalized.origin ? `${normalized.origin} → ${destino}` : destino);
  const primeirasLegs = first?.products.flights?.[0]?.legs ?? [];

  return {
    type,
    title,
    subtitle:
      publicOptions.length > 1
        ? `${publicOptions.length} opções para você escolher`
        : (params.clientName ?? null),
    origin: normalized.origin ?? null,
    destination: destino,
    startDate: normalized.startDate ?? options[0]?.startDate ?? null,
    endDate: normalized.endDate ?? options[0]?.endDate ?? null,
    nights: options[0]?.hotels[0]?.nights ?? null,
    tripKind: primeirasLegs.length
      ? primeirasLegs.some((l) => l.direction === "INBOUND")
        ? "Ida e volta"
        : primeirasLegs.length > 1
          ? "Multi-trecho"
          : "Somente ida"
      : null,
    cabin: primeirasLegs[0]?.cabin ?? null,
    passengers: { adults: adultos, children: criancas, infants: bebes, label: paxLabel },
    products: first?.products ?? {},
    options: publicOptions,
    payment: first?.payment ?? buildPayment({ type, total: 0 }),
    totals: first?.totals ?? { products: 0, taxes: 0, total: 0 },
    summary: options[0] ? optionSummary(options[0]) : [],
    agent: params.agentName
      ? {
          name: params.agentName,
          photoUrl: agentPhoto(params.agentName),
          phone: null,
          whatsapp: null,
          email: null,
        }
      : null,
    source: { type: "SYSTEM", conversationId: null },
    validUntil: params.validUntil ?? null,
    publicNotes: null,
  };
}
