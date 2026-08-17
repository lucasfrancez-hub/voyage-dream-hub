import { z } from "zod";
import {
  flightSignature,
  type OnerFareOption,

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
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
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
    // API real: 0=todos, 1=diretos, 2=exatamente uma conexão.
    // "Até 1 parada" precisa buscar todos e ser refinado no cliente.
    maxStopsEnum: f.maxStops === 0 ? 1 : 0,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera cancelável: um abort libera na hora, sem segurar o worker. */
function sleepCancelavel(ms: number, signal?: AbortSignal) {
  if (!signal) return sleep(ms);
  return new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      resolve();
    }
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Timeout padrão de UMA requisição HTTP ao motor (nunca fica pendurada). */
const FETCH_TIMEOUT_MS = Number(process.env["ONER_FETCH_TIMEOUT_MS"] ?? 20_000);

/**
 * fetch com CANCELAMENTO REAL: aborta por timeout próprio e também quando o
 * chamador aborta. Sem isso uma requisição pendurada no fornecedor continuava
 * viva depois do timeout do worker, consumindo conexões e travando a fila.
 */
async function fetchMotor(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`timeout:http:${timeoutMs}ms`)), timeoutMs);
  const onAbort = () => ctrl.abort(new Error("cancelado:motor"));
  if (signal) {
    if (signal.aborted) {
      clearTimeout(t);
      throw new Error("cancelado:motor");
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (signal?.aborted) throw new Error("cancelado:motor");
    if (ctrl.signal.aborted) throw new Error(`timeout:http:${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

export type PollSpeed = "normal" | "fast";

async function poll(
  path: "outbound" | "inbound",
  loc: string,
  body: Record<string, unknown>,
  maxRounds = 30,
  speed: PollSpeed = "normal",
  signal?: AbortSignal,
): Promise<OnerLegResult> {

  const acc = new Map<string, OnerFlight>();
  // Todas as tarifas vistas para o MESMO voo (mesma assinatura). A operadora
  // combina ida+volta por tarifa/fornecedor: a mais barata às vezes não tem
  // volta combinável, então guardamos as demais como plano B.
  const fares = new Map<string, Map<string, OnerFlight>>();
  const startedAt = Date.now();

  // Fornecedores publicam em ondas. Em vez de esperar sempre todas as rodadas,
  // paramos quando o conteúdo estabiliza (nada novo nem mais barato) — mesma
  // qualidade de resultado, bem menos espera.
  // No modo "fast" (WhatsApp/IA) a prioridade é entregar rápido: cortamos as
  // rodadas mínimas, o tempo entre rodadas e o orçamento total.
  const quick = speed === "fast";
  const MIN_ROUNDS = quick ? 3 : 10;
  const STABLE_ROUNDS = quick ? 2 : 6;
  const TIME_BUDGET_MS = quick ? 11_000 : 42_000;
  const GAP_MS = quick ? 450 : 800;
  let stable = 0;
  // Rodadas em que já veio conteúdo. Fornecedores (GOL, LATAM, consolidadores)
  // publicam em ondas diferentes — sair na primeira onda faz sumir voos e
  // mostrar tarifa mais cara do que a real.
  let roundsWithFlights = 0;

  for (let i = 0; i < maxRounds; i++) {
    if (signal?.aborted) throw new Error("cancelado:motor");

    let changed = false;
    let haveMore = false;
    let page = 1;
    do {
      const res = await fetchMotor(
        `${SERVERLESS}/api/flight/v1/search/${path}`,
        {
          method: "POST",
          headers: headers(loc),
          body: JSON.stringify({ ...body, page }),
        },
        signal,
      );
      if (!res.ok) break;
      try {
        const json = (await res.json()) as {
          haveMore?: boolean;
          flights?: OnerFlight[];
        };
        for (const flight of json.flights ?? []) {
          const signature = flightSignature(flight);
          let bucket = fares.get(signature);
          if (!bucket) {
            bucket = new Map<string, OnerFlight>();
            fares.set(signature, bucket);
          }
          if (flight.key && !bucket.has(flight.key)) bucket.set(flight.key, flight);
          const previous = acc.get(signature);
          if (!previous || flight.price.total < previous.price.total) {
            acc.set(signature, flight);
            changed = true;
          }
        }

        haveMore = !!json.haveMore && (json.flights?.length ?? 0) > 0;
        page++;
      } catch {
        break;
      }
    } while (haveMore && page <= 50 && !signal?.aborted);

    stable = changed ? 0 : stable + 1;
    if (acc.size > 0) roundsWithFlights++;

    const enough =
      i + 1 >= MIN_ROUNDS &&
      acc.size > 0 &&
      roundsWithFlights >= (quick ? 2 : 5) &&
      stable >= STABLE_ROUNDS;
    if (enough || Date.now() - startedAt > TIME_BUDGET_MS) break;

    if (i + 1 < maxRounds) await sleepCancelavel(GAP_MS, signal);
  }


  const flights = [...acc.entries()]
    .map(([signature, flight]) => {
      const ordered = [...(fares.get(signature)?.values() ?? [])].sort(
        (a, b) => a.price.total - b.price.total,
      );
      const fareOptions: OnerFareOption[] = [];
      const seen = new Set<string>();
      for (const f of ordered) {
        const family = f.journey?.fareClass?.airlineFareFamily ?? null;
        const bags = (f.journey?.baggagesAllowance ?? [])
          .map((b) => `${b.typeDescription ?? ""}${b.quantity ?? ""}${b.weight ?? ""}`)
          .sort()
          .join(",");
        const cabin = f.journey?.fareClass?.cabinClass ?? f.journey?.segments?.[0]?.cabinClass ?? null;
        // Mesma família + mesma cabine + mesma bagagem = a MESMA tarifa vinda de
        // outro fornecedor/consolidador. Preço não entra na chave: se entrasse,
        // o cliente veria "duas Light iguais" com diferença absurda de preço.
        // Como `ordered` está do mais barato para o mais caro, fica a mais barata.
        const dedupe = `${family ?? ""}|${cabin ?? ""}|${bags}|${f.journey?.allowedBaggage ? 1 : 0}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        fareOptions.push({
          key: f.key,
          total: f.price.total,
          price: f.price.price,
          tax: f.price.tax,
          cabinClass: cabin,
          fareFamily: family,
          allowedBaggage: f.journey?.allowedBaggage,
          baggagesAllowance: f.journey?.baggagesAllowance,
        });
      }

      return {
        ...flight,
        fareOptions,
        altKeys: ordered.map((f) => f.key),
        altTotals: ordered.map((f) => f.price.total),
      };
    })
    .sort((a, b) => a.price.total - b.price.total);

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

export async function searchFlights(data: SearchData, speed: PollSpeed = "normal"): Promise<OnerSearchResult> {
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
      throw new Error(
        `A operadora não retornou chave de busca (HTTP ${startRes.status}). Tente novamente em instantes.`,
      );
    }
  }

  const outbound = await poll(
    "outbound",
    loc,
    {
      searchKey,
      pageSize: data.pageSize,
      filter: buildFilter(data.filters),
      ordinationEnum: 0,
    },
    30,
    speed,
  );
  return { searchKey, outbound, inbound: null };
}

export async function searchInboundFlights(
  data: InboundData,
  speed: PollSpeed = "normal",
): Promise<OnerLegResult> {
  const loc = buildLocationHref(data);
  return poll(
    "inbound",
    loc,
    {
      searchKey: data.searchKey,
      flightKey: data.flightKey,
      pageSize: data.pageSize,
      filter: buildFilter(data.filters),
      ordinationEnum: 0,
    },
    30,
    speed,
  );
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
  // Contexto da busca: sem isso o carrinho da operadora abre sem origem,
  // destino, datas e pax na barra de busca e dispara "erro interno".
  departureIata: z.string().length(3).nullish(),
  arrivalIata: z.string().length(3).nullish(),
  departureDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(9).default(0),
  infants: z.number().int().min(0).max(9).default(0),
  departureIsCity: z.boolean().default(false),
  arrivalIsCity: z.boolean().default(false),
  /** Tarifa fechada (promoções internacionais): tentar primeiro só a VOLTA. */
  preferInboundFare: z.boolean().default(false),
});

type CartData = z.infer<typeof cartInput>;

/** Query com o contexto da busca, no mesmo formato usado pelo flight-list. */
function cartContextParams(data: CartData): URLSearchParams {
  const q = new URLSearchParams();
  if (data.departureDate) q.set("departureDate", `${data.departureDate}T00:00:00.000Z`);
  if (data.returnDate) q.set("returnDate", `${data.returnDate}T00:00:00.000Z`);
  if (data.departureIata) q.set("departureIata", data.departureIata.toUpperCase());
  if (data.arrivalIata) q.set("arrivalIata", data.arrivalIata.toUpperCase());
  q.set("isDepartureIataCity", String(!!data.departureIsCity));
  q.set("isArrivalIataCity", String(!!data.arrivalIsCity));
  q.set("adultsCount", String(data.adults));
  q.set("teenagerCount", "0");
  q.set("childCount", String(data.children));
  q.set("infantCount", String(data.infants));
  return q;
}

export async function createFlightCart(data: CartData) {
  const ctx = cartContextParams(data);
  const listQuery = new URLSearchParams(ctx);
  listQuery.set("isRoundTrip", String(data.isRoundTrip));
  listQuery.set("source", "f");
  const loc = `https://www.comprarviagem.com.br/viaair/flight-list?${listQuery.toString()}`;
  // Tarifa combinada/fechada (comum em internacional): ida e volta compartilham
  // a MESMA tarifa. A operadora estoura 500 se mandarmos fareId2 repetido — e em
  // parte dos casos a tarifa válida é a da VOLTA (inbound). Montamos uma lista de
  // tentativas em ordem e vamos testando até o carrinho ser criado.
  const sameFare = !!data.inboundFareId && data.inboundFareId === data.outboundFareId;
  const buildBody = (fareId: string, fareId2: string | null) =>
    JSON.stringify({
      flight: {
        searchKey: data.searchKey,
        fareId,
        fareId2,
        outboundItineraryId: data.outboundItineraryId,
        inboundItineraryId: data.inboundItineraryId ?? null,
        teenagerCount: 0,
      },
      searchBookingKey: null,
      affiliateTag: null,
      eventId: null,
    });

  const out = data.outboundFareId;
  const inb = data.inboundFareId ?? null;
  const candidates: string[] = [];
  if (!data.isRoundTrip || !inb) {
    candidates.push(buildBody(out, null));
  } else if (sameFare) {
    // Tarifa fechada: uma única tarifa cobre ida + volta.
    candidates.push(buildBody(out, null));
  } else if (data.preferInboundFare) {
    // Tarifa fechada de ida e volta: a operadora só aceita a tarifa da VOLTA.
    candidates.push(buildBody(inb, null));
    candidates.push(buildBody(out, inb));
    candidates.push(buildBody(out, null));
  } else {
    candidates.push(buildBody(out, inb));
    // Fallbacks para tarifa fechada mal sinalizada: só a volta, depois só a ida.
    candidates.push(buildBody(inb, null));
    candidates.push(buildBody(out, null));
  }
  let candidateIndex = 0;
  let body = candidates[0]!;



  let cartId = "";
  let lastStatus = 0;
  let lastMessage = "";
  // A operadora costuma devolver 5xx/timeout esporádico; tentamos 3x com backoff.
  for (let attempt = 0; attempt < 4 + candidates.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
    let res: Response;
    try {
      res = await fetch(`${API}/api/booking`, { method: "POST", headers: headers(loc), body });
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
      continue;
    }
    lastStatus = res.status;
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { data?: string; message?: string; errors?: unknown };
      cartId = parsed.data ?? "";
      if (!cartId && parsed.message) lastMessage = parsed.message;
    } catch {
      cartId = "";
      if (text) lastMessage = text.slice(0, 200);
    }
    if (res.ok && cartId) break;
    cartId = "";
    // Ainda há combinação de tarifa para testar (tarifa fechada: só a volta,
    // depois só a ida)? Tenta a próxima antes de desistir.
    if (candidateIndex < candidates.length - 1) {
      candidateIndex += 1;
      body = candidates[candidateIndex]!;
      continue;
    }
    // 4xx = tarifa realmente expirada/invalidada: não adianta repetir.
    if (res.status >= 400 && res.status < 500) break;
  }


  if (!cartId) {
    console.error("[onertravel] falha ao criar carrinho aéreo", {
      status: lastStatus,
      message: lastMessage,
      searchKey: data.searchKey,
    });
    const detalhe = lastMessage ? ` Detalhe da operadora: ${lastMessage}` : "";
    throw new Error(
      `A operadora não gerou o carrinho (tarifa pode ter expirado, HTTP ${lastStatus}). Refaça a busca e tente de novo.${detalhe}`,
    );
  }

  const cartQuery = new URLSearchParams({ newCartId: cartId, source: "f" });
  cartQuery.set("isRoundTrip", String(data.isRoundTrip));
  ctx.forEach((v, k) => cartQuery.set(k, v));
  const url = `https://www.comprarviagem.com.br/viaair/flight-cart?${cartQuery.toString()}`;
  return { cartId, url };
}

