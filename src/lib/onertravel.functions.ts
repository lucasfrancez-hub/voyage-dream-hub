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

export type OnerLegResult = {
  totalFlightsCount: number;
  flights: OnerFlight[];
  priceRange?: { minPrice: number; maxPrice: number } | null;
};

export type OnerSearchResult = {
  searchKey: string;
  outbound: OnerLegResult;
  inbound?: OnerLegResult | null;
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

/**
 * Filtros aplicados PELA OPERADORA (server-side). A lista padrão só traz a
 * família mais barata (LIGHT, sem bagagem despachada); por isso filtrar no
 * navegador não funciona — é preciso repetir a consulta com os filtros.
 */
const OperatorFilters = z.object({
  containsDispatchBaggage: z.boolean().default(false),
  maxStops: z.number().int().min(0).max(2).default(2),
  startPrice: z.number().nullable().default(null),
  endPrice: z.number().nullable().default(null),
  /** Janela de horário de partida em minutos desde 00:00 (0–1440). */
  departureFrom: z.number().int().min(0).max(1440).nullable().default(null),
  departureTo: z.number().int().min(0).max(1440).nullable().default(null),
  airlineIatas: z.array(z.string()).default([]),
  cabinClass: z.string().nullable().default(null),
});

export type OnerOperatorFilters = z.infer<typeof OperatorFilters>;

const hm = (mins: number | null | undefined) =>
  mins === null || mins === undefined ? null : { hour: Math.floor(mins / 60) % 24, minute: mins % 60 };

function buildFilter(f: OnerOperatorFilters) {
  const isFullDay = f.departureFrom === 0 && (f.departureTo === 1440 || f.departureTo === null);
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
    maxStopsEnum: f.maxStops,
  };
}

const DEFAULT_FILTERS: OnerOperatorFilters = OperatorFilters.parse({});

const SearchInput = z.object({
  departureIata: z.string().min(3).max(3),
  arrivalIata: z.string().min(3).max(3),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(9).default(0),
  infants: z.number().int().min(0).max(9).default(0),
  pageSize: z.number().int().min(1).max(30).default(30),
  /** Reaproveita uma busca já iniciada (usado ao trocar filtros). */
  searchKey: z.string().nullish(),
  filters: OperatorFilters.default(DEFAULT_FILTERS),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A tarifa padrão da operadora vem sempre sem bagagem despachada (Lite). */
export function flightHasBaggage(f: OnerFlight): boolean {
  if (f.journey.allowedBaggage) return true;
  const list = f.journey.baggagesAllowance ?? [];
  return list.some((b) => {
    const desc = `${b.typeDescription ?? ""}`.toLowerCase();
    const isChecked = desc.includes("dispatch") || desc.includes("despach") || desc.includes("checked");
    return isChecked && (b.quantity ?? 0) > 0;
  });
}

async function poll(
  path: "outbound" | "inbound",
  loc: string,
  body: Record<string, unknown>,
  /** quando os filtros já estão aplicados, poucas rodadas bastam */
  maxRounds = 20,
): Promise<OnerLegResult> {
  // A operadora agrega resultados de vários fornecedores; o total cresce a cada
  // consulta. Continuamos consultando até estabilizar (ou esgotar o tempo).
  let best: OnerLegResult = { totalFlightsCount: 0, flights: [], priceRange: null };
  let stableRounds = 0;
  for (let i = 0; i < maxRounds; i++) {
    const res = await fetch(`${SERVERLESS}/api/flight/v1/search/${path}`, {
      // header `searchkey` NÃO deve ser enviado — o site não envia e a API
      // devolve lista vazia quando ele está presente.
      method: "POST",
      headers: headers(loc),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      try {
        const json = JSON.parse(text) as {
          totalFlightsCount: number;
          flights: OnerFlight[];
          filterPriceRange?: { minPrice: number; maxPrice: number };
        };
        if ((json.totalFlightsCount ?? 0) > best.totalFlightsCount) {
          best = {
            totalFlightsCount: json.totalFlightsCount,
            flights: json.flights ?? [],
            priceRange: json.filterPriceRange ?? null,
          };
          stableRounds = 0;
        } else if (best.totalFlightsCount > 0) {
          stableRounds++;
          if (stableRounds >= 2) return best;
        }
      } catch {
        /* continua */
      }
    }
    await sleep(1500);
  }
  return best;
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

    let searchKey = data.searchKey ?? "";

    if (!searchKey) {
      const startRes = await fetch(`${SERVERLESS}/api/flight/v1/search`, {
        method: "POST",
        headers: headers(loc),
        body: JSON.stringify({
          departureDate: `${data.departureDate}T00:00:00.000Z`,
          // só inclui returnDate em ida-e-volta; enviar null quebra a busca
          ...(data.returnDate ? { returnDate: `${data.returnDate}T00:00:00.000Z` } : {}),
          departureStation: data.departureIata.toUpperCase(),
          arrivalStation: data.arrivalIata.toUpperCase(),
          paxAdtCount: data.adults,
          paxChdCount: data.children,
          paxInfCount: data.infants,
        }),
      });

      const startText = await startRes.text();
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
    }

    const filterBody = {
      searchKey,
      page: 1,
      pageSize: data.pageSize,
      filter: buildFilter(data.filters),
      ordinationEnum: 0,
    };

    // A volta só existe depois que uma opção de ida é escolhida (a operadora
    // combina as tarifas). Aqui devolvemos apenas a ida; o cliente chama
    // `onerInboundSearch` com a chave do voo de ida selecionado.
    const outbound = await poll("outbound", loc, filterBody, data.searchKey ? 8 : 20);

    return { searchKey, outbound, inbound: null };
  });

// -------------------------------------------------- volta (após escolher ida)

export const onerInboundSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        searchKey: z.string().min(5),
        flightKey: z.string().min(5),
        departureIata: z.string().length(3),
        arrivalIata: z.string().length(3),
        departureDate: z.string(),
        returnDate: z.string(),
        adults: z.number().int().min(1).default(1),
        children: z.number().int().min(0).default(0),
        infants: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(30).default(30),
        filters: OperatorFilters.default(DEFAULT_FILTERS),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<OnerLegResult> => {
    const loc = buildLocationHref({
      departureDate: data.departureDate,
      returnDate: data.returnDate,
      departureIata: data.departureIata.toUpperCase(),
      arrivalIata: data.arrivalIata.toUpperCase(),
      adults: data.adults,
      children: data.children,
      infants: data.infants,
    });

    return poll("inbound", loc, {
      searchKey: data.searchKey,
      flightKey: data.flightKey,
      page: 1,
      pageSize: data.pageSize,
      filter: buildFilter(data.filters),
      ordinationEnum: 0,
    });
  });
