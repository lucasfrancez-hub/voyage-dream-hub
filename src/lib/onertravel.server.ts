import { z } from "zod";
import {
  flightSignature,
  type OnerFlight,
  type OnerLegResult,
  type OnerSearchResult,
} from "@/lib/onertravel.types";

const API = "https://api.onertravel.com";
const SERVERLESS = "https://serverless.api.onertravel.com";
const INSTITUTION_ID = "23";
const AGENT_ID = "83956";

function headers(locationHref: string): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    authorization: "Bearer",
    institutionid: INSTITUTION_ID,
    agentid: AGENT_ID,
    applicationname: "COMPRARVIAGEM",
    applicationaccesstype: "1",
    platform: "WEBAPP",
    language: "4",
    currencie: "1",
    currency: "1",
    ispackage: "false",
    referer: "https://www.comprarviagem.com.br/",
    origin: "https://www.comprarviagem.com.br",
    "x-location-href": locationHref,
  };
}

const OperatorFilters = z.object({
  containsDispatchBaggage: z.boolean().default(false),
  maxStops: z.number().int().min(0).max(2).default(2),
  startPrice: z.number().nullable().default(null),
  endPrice: z.number().nullable().default(null),
  departureFrom: z.number().int().min(0).max(1440).nullable().default(null),
  departureTo: z.number().int().min(0).max(1440).nullable().default(null),
  airlineIatas: z.array(z.string()).default([]),
  cabinClass: z.string().nullable().default(null),
});

export type OnerOperatorFilters = z.infer<typeof OperatorFilters>;

const DEFAULT_FILTERS: OnerOperatorFilters = OperatorFilters.parse({});

export const airportSearchInput = z.object({
  query: z.string().min(2),
  isDeparture: z.boolean().default(true),
});

export const flightSearchInput = z.object({
  departureIata: z.string().min(3).max(3),
  arrivalIata: z.string().min(3).max(3),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(9).default(0),
  infants: z.number().int().min(0).max(9).default(0),
  pageSize: z.number().int().min(1).max(50).default(50),
  departureIsCity: z.boolean().default(false),
  arrivalIsCity: z.boolean().default(false),
  searchKey: z.string().nullish(),
  filters: OperatorFilters.default(DEFAULT_FILTERS),
});

export const inboundSearchInput = flightSearchInput
  .omit({ searchKey: true, returnDate: true })
  .extend({
    searchKey: z.string().min(5),
    flightKey: z.string().min(5),
    returnDate: z.string().min(1),
  });

type SearchData = z.infer<typeof flightSearchInput>;
type InboundData = z.infer<typeof inboundSearchInput>;

function buildLocationHref(data: SearchData | InboundData) {
  const q = new URLSearchParams({
    departureDate: `${data.departureDate}T00:00:00.000Z`,
    isRoundTrip: String(!!data.returnDate),
    adultsCount: String(data.adults),
    teenagerCount: "0",
    infantCount: String(data.infants),
    childCount: String(data.children),
    departureIata: data.departureIata,
    arrivalIata: data.arrivalIata,
    isDepartureIataCity: String(data.departureIsCity),
    isArrivalIataCity: String(data.arrivalIsCity),
    source: "f",
  });
  if (data.returnDate) q.set("returnDate", `${data.returnDate}T00:00:00.000Z`);
  return `https://www.comprarviagem.com.br/viaair/flight-list?${q.toString()}`;
}

const hm = (mins: number | null | undefined) =>
  mins === null || mins === undefined
    ? null
    : { hour: Math.floor(mins / 60) % 24, minute: mins % 60 };

function buildFilter(f: OnerOperatorFilters) {
  const isFullDay = f.departureFrom === 0 &&
    (f.departureTo === 1440 || f.departureTo === null);
  return {
    containsDispatchBaggage: f.containsDispatchBaggage,
    cabinClass: f.cabinClass,
    startPrice: f.startPrice,
    endPrice: f.endPrice,
    startDepartureTime: isFullDay ? null : hm(f.departureFrom),
    endDepartureTime: isFullDay ? null : hm(f.departureTo === 1440 ? 1439 : f.departureTo),
    departureAirportIatas: [] as string[],
    arrivalAirportIatas: [] as string[],
    marketingAirlineIatas: f.airlineIatas,
    // API real: 0=todos, 1=diretos, 2=exatamente uma conexão.
    // "Até 1 parada" precisa buscar todos e ser refinado no cliente.
    maxStopsEnum: f.maxStops === 0 ? 1 : 0,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function poll(
  path: "outbound" | "inbound",
  loc: string,
  body: Record<string, unknown>,
  maxRounds = 30,
): Promise<OnerLegResult> {
  const acc = new Map<string, OnerFlight>();

  for (let i = 0; i < maxRounds; i++) {
    let haveMore = false;
    let page = 1;
    do {
      const res = await fetch(`${SERVERLESS}/api/flight/v1/search/${path}`, {
        method: "POST",
        headers: headers(loc),
        body: JSON.stringify({ ...body, page }),
      });
      if (!res.ok) break;
      try {
        const json = (await res.json()) as {
          haveMore?: boolean;
          flights?: OnerFlight[];
        };
        for (const flight of json.flights ?? []) {
          const signature = flightSignature(flight);
          const previous = acc.get(signature);
          if (!previous || flight.price.total < previous.price.total) {
            acc.set(signature, flight);
          }
        }
        haveMore = !!json.haveMore && (json.flights?.length ?? 0) > 0;
        page++;
      } catch {
        break;
      }
    } while (haveMore && page <= 50);

    if (i + 1 < maxRounds) await sleep(900);
  }

  const flights = [...acc.values()].sort((a, b) => a.price.total - b.price.total);
  const totals = flights.map((flight) => flight.price.total).filter(Number.isFinite);
  return {
    totalFlightsCount: flights.length,
    flights,
    priceRange: totals.length
      ? { minPrice: Math.min(...totals), maxPrice: Math.max(...totals) }
      : null,
  };
}

export async function searchAirports(data: z.infer<typeof airportSearchInput>) {
  const url = `${API}/api/airport/search?name=${encodeURIComponent(data.query)}&isDeparture=${data.isDeparture}`;
  const res = await fetch(url, { headers: headers("https://www.comprarviagem.com.br/viaair/") });
  if (!res.ok) throw new Error(`Falha ao buscar aeroportos (${res.status})`);
  type Airport = {
    iata?: string;
    name?: string;
    city?: string;
    country?: string;
    isCity?: boolean;
    isIataCity?: boolean;
    iataCityCode?: string | null;
    airports?: Airport[] | null;
  };
  const json = (await res.json()) as unknown;

  // A operadora ora devolve um array direto, ora { data: [...] } ou { data: { airports: [...] } }
  const pickList = (value: unknown, depth = 0): Airport[] => {
    if (Array.isArray(value)) return value as Airport[];
    if (value && typeof value === "object" && depth < 4) {
      const obj = value as Record<string, unknown>;
      for (const key of ["data", "airports", "items", "results", "stations", "list"]) {
        if (key in obj) {
          const found = pickList(obj[key], depth + 1);
          if (found.length) return found;
        }
      }
    }
    return [];
  };

  // A operadora agrupa a cidade (ex.: RIO) e pendura os aeroportos filhos
  // (GIG, SDU...). Achatamos tudo para o usuário poder escolher o aeroporto.
  const out: Array<{
    iata: string;
    name: string;
    city: string;
    country: string;
    isCity: boolean;
    cityCode: string | null;
  }> = [];

  for (const airport of pickList(json)) {
    if (!airport?.iata) continue;
    const isCity = !!(airport.isCity ?? airport.isIataCity);
    out.push({
      iata: airport.iata,
      name: airport.name ?? "",
      city: airport.city ?? "",
      country: airport.country ?? "",
      isCity,
      cityCode: airport.iataCityCode ?? (isCity ? airport.iata : null),
    });
    for (const child of airport.airports ?? []) {
      if (!child?.iata) continue;
      out.push({
        iata: child.iata,
        name: child.name ?? "",
        city: child.city ?? airport.city ?? "",
        country: child.country ?? airport.country ?? "",
        isCity: false,
        cityCode: child.iataCityCode ?? airport.iata,
      });
    }
  }

  return out.slice(0, 20);
}

export async function searchFlights(data: SearchData): Promise<OnerSearchResult> {
  const loc = buildLocationHref(data);
  let searchKey = data.searchKey ?? "";

  if (!searchKey) {
    const startRes = await fetch(`${SERVERLESS}/api/flight/v1/search`, {
      method: "POST",
      headers: headers(loc),
      body: JSON.stringify({
        departureDate: `${data.departureDate}T00:00:00.000Z`,
        ...(data.returnDate ? { returnDate: `${data.returnDate}T00:00:00.000Z` } : {}),
        departureStation: data.departureIata.toUpperCase(),
        arrivalStation: data.arrivalIata.toUpperCase(),
        isDepartureStationCity: data.departureIsCity,
        isArrivalStationCity: data.arrivalIsCity,
        paxAdtCount: data.adults,
        paxChdCount: data.children,
        paxInfCount: data.infants,
      }),
    });
    const startText = await startRes.text();
    try {
      searchKey = (JSON.parse(startText) as { searchKey?: string }).searchKey ?? "";
    } catch {
      searchKey = "";
    }
    if (!searchKey) {
      throw new Error(`A operadora não retornou chave de busca (HTTP ${startRes.status}). Tente novamente em instantes.`);
    }
  }

  const outbound = await poll("outbound", loc, {
    searchKey,
    pageSize: data.pageSize,
    filter: buildFilter(data.filters),
    ordinationEnum: 0,
  });
  return { searchKey, outbound, inbound: null };
}

export async function searchInboundFlights(data: InboundData): Promise<OnerLegResult> {
  const loc = buildLocationHref(data);
  return poll("inbound", loc, {
    searchKey: data.searchKey,
    flightKey: data.flightKey,
    pageSize: data.pageSize,
    filter: buildFilter(data.filters),
    ordinationEnum: 0,
  });
}
/* ── Carrinho na operadora (Comprar Viagem) ─────────────────────────────
   Cria o carrinho oficial com os voos escolhidos e devolve a URL pública
   /viaair/flight-cart?newCartId=... para enviar ao cliente.            */
export const cartInput = z.object({
  searchKey: z.string().min(5),
  outboundFareId: z.string().min(5),
  outboundItineraryId: z.string().min(5),
  inboundFareId: z.string().nullish(),
  inboundItineraryId: z.string().nullish(),
  isRoundTrip: z.boolean().default(false),
});

export async function createFlightCart(data: z.infer<typeof cartInput>) {
  const loc = "https://www.comprarviagem.com.br/viaair/flight-list";
  const res = await fetch(`${API}/api/booking`, {
    method: "POST",
    headers: headers(loc),
    body: JSON.stringify({
      flight: {
        searchKey: data.searchKey,
        fareId: data.outboundFareId,
        fareId2: data.inboundFareId ?? null,
        outboundItineraryId: data.outboundItineraryId,
        inboundItineraryId: data.inboundItineraryId ?? null,
        teenagerCount: 0,
      },
      searchBookingKey: null,
      affiliateTag: null,
      eventId: null,
    }),
  });
  const text = await res.text();
  let cartId = "";
  try {
    cartId = (JSON.parse(text) as { data?: string }).data ?? "";
  } catch {
    cartId = "";
  }
  if (!res.ok || !cartId) {
    throw new Error(
      "A operadora não gerou o carrinho (tarifa pode ter expirado). Refaça a busca e tente de novo.",
    );
  }
  const url = `https://www.comprarviagem.com.br/viaair/flight-cart?newCartId=${cartId}&source=f&isRoundTrip=${data.isRoundTrip}`;
  return { cartId, url };
}
