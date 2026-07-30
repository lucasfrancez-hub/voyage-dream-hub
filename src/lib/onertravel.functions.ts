import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Integração com a plataforma Öner Travel (Comprar Viagem / VIA AIR).
 * API interna não documentada — descoberta via inspeção das chamadas do site.
 *
 *  1) POST serverless/api/flight/v1/search           -> { searchKey }
 *  2) POST serverless/api/flight/v1/search/outbound  -> voos de ida
 *  3) POST serverless/api/flight/v1/search/inbound   -> voos de volta
 *  4) GET  api/airport/search?name=&isDeparture=     -> autocomplete
 */

const API = "https://api.onertravel.com";
const SERVERLESS = "https://serverless.api.onertravel.com";

const INSTITUTION_ID = "23";
const AGENT_ID = "83956"; // VIA AIR

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
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  };
}

function buildLocationHref(p: {
  departureDate: string;
  returnDate?: string | null;
  departureIata: string;
  arrivalIata: string;
  adults: number;
  children: number;
  infants: number;
}) {
  const q = new URLSearchParams({
    departureDate: `${p.departureDate}T00:00:00.000Z`,
    isRoundTrip: String(!!p.returnDate),
    adultsCount: String(p.adults),
    teenagerCount: "0",
    infantCount: String(p.infants),
    childCount: String(p.children),
    departureIata: p.departureIata,
    arrivalIata: p.arrivalIata,
    isDepartureIataCity: "false",
    isArrivalIataCity: "false",
    source: "f",
  });
  if (p.returnDate) q.set("returnDate", `${p.returnDate}T00:00:00.000Z`);
  return `https://www.comprarviagem.com.br/viaair/flight-list?${q.toString()}`;
}

// ---------------------------------------------------------------- tipos

export type OnerPlace = {
  iata: string;
  name: string;
  city: string;
  date: { year: number; month: number; day: number };
  time: { hour: number; minute: number };
};

export type OnerSegment = {
  segmentNumber: number;
  flightNumber: string;
  cabinClass?: string;
  airlineFareFamily?: string;
  departure: OnerPlace;
  destination: OnerPlace;
  marketingAirline?: { iata?: string; name?: string; pathLogo?: string };
};

export type OnerFlight = {
  key: string;
  price: {
    price: number;
    tax: number;
    serviceTax?: number;
    total: number;
    passengerCount: number;
  };
  journey: {
    flyingTime: { hour: number; minute: number };
    numberOfStops: number;
    fareClass?: { cabinClass?: string; airlineFareFamily?: string };
    allowedBaggage?: boolean;
    baggagesAllowance?: Array<{
      typeDescription?: string;
      quantity?: number;
      weight?: number;
      unitDescription?: string;
    }>;
    departure: OnerPlace;
    destination: OnerPlace;
    marketingAirline?: { iata?: string; name?: string; pathLogo?: string };
    segments: OnerSegment[];
  };
};

export type OnerSearchResult = {
  searchKey: string;
  outbound: { totalFlightsCount: number; flights: OnerFlight[] };
  inbound?: { totalFlightsCount: number; flights: OnerFlight[] } | null;
};

// ---------------------------------------------------------------- aeroportos

export const onerAirportSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ query: z.string().min(2), isDeparture: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data }) => {
    const url = `${API}/api/airport/search?name=${encodeURIComponent(data.query)}&isDeparture=${data.isDeparture}`;
    const res = await fetch(url, {
      headers: headers("https://www.comprarviagem.com.br/viaair/"),
    });
    if (!res.ok) throw new Error(`Falha ao buscar aeroportos (${res.status})`);
    const json = (await res.json()) as {
      data?: Array<{ iata?: string; name?: string; city?: string; country?: string; isCity?: boolean }>;
    };
    return (json.data ?? [])
      .filter((a) => !!a.iata)
      .slice(0, 12)
      .map((a) => ({
        iata: a.iata!,
        name: a.name ?? "",
        city: a.city ?? "",
        country: a.country ?? "",
        isCity: !!a.isCity,
      }));
  });

// ---------------------------------------------------------------- busca

const SearchInput = z.object({
  departureIata: z.string().min(3).max(3),
  arrivalIata: z.string().min(3).max(3),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(9).default(0),
  infants: z.number().int().min(0).max(9).default(0),
  maxStops: z.number().int().min(0).max(2).default(0),
  pageSize: z.number().int().min(1).max(30).default(10),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function poll(
  path: "outbound" | "inbound",
  searchKey: string,
  loc: string,
  body: Record<string, unknown>,
) {
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${SERVERLESS}/api/flight/v1/search/${path}`, {
      method: "POST",
      headers: { ...headers(loc), searchkey: searchKey },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok && text.trim().length > 40) {
      try {
        return JSON.parse(text) as { totalFlightsCount: number; flights: OnerFlight[] };
      } catch {
        /* continua */
      }
    }
    await sleep(2500);
  }
  return { totalFlightsCount: 0, flights: [] as OnerFlight[] };
}

export const onerFlightSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SearchInput.parse(d))
  .handler(async ({ data }): Promise<OnerSearchResult> => {
    const loc = buildLocationHref({
      departureDate: data.departureDate,
      returnDate: data.returnDate ?? null,
      departureIata: data.departureIata.toUpperCase(),
      arrivalIata: data.arrivalIata.toUpperCase(),
      adults: data.adults,
      children: data.children,
      infants: data.infants,
    });

    const startRes = await fetch(`${SERVERLESS}/api/flight/v1/search`, {
      method: "POST",
      headers: headers(loc),
      body: JSON.stringify({
        departureDate: `${data.departureDate}T00:00:00.000Z`,
        returnDate: data.returnDate ? `${data.returnDate}T00:00:00.000Z` : null,
        departureStation: data.departureIata.toUpperCase(),
        arrivalStation: data.arrivalIata.toUpperCase(),
        paxAdtCount: data.adults,
        paxChdCount: data.children,
        paxInfCount: data.infants,
      }),
    });

    const startText = await startRes.text();
    let searchKey = "";
    try {
      searchKey = (JSON.parse(startText) as { searchKey?: string }).searchKey ?? "";
    } catch {
      /* ignore */
    }
    if (!searchKey) {
      throw new Error(
        `A operadora não retornou chave de busca (HTTP ${startRes.status}). Tente novamente em instantes.`,
      );
    }

    const filterBody = {
      searchKey,
      page: 1,
      pageSize: data.pageSize,
      filter: { maxStopsEnum: data.maxStops, startPrice: null, endPrice: null },
      ordinationEnum: 0,
    };

    const outbound = await poll("outbound", searchKey, loc, filterBody);
    let inbound: { totalFlightsCount: number; flights: OnerFlight[] } | null = null;
    if (data.returnDate) {
      inbound = await poll("inbound", searchKey, loc, filterBody);
    }

    return { searchKey, outbound, inbound };
  });
