/**
 * MelhoresDestinosRadarService — RADAR DE OPORTUNIDADES (somente descoberta).
 *
 * Este módulo é a ÚNICA porta de entrada do Melhores Destinos para o robô
 * interno "Promoções de Aéreo". Ele navega os endpoints JSON públicos:
 *
 *   /api/v1/twd/web/categories                       → categorias
 *   /api/v1/twd/web/categories?category_id&from_iata → destinos da origem
 *   /api/v1/twd/web/itinerary_prices/ORI/DES         → meses + dates_link
 *   (dates_link)                                     → ofertas/datas reais
 *   /api/v1/airports/origins                         → normalização de origens
 *
 * REGRA ABSOLUTA: o preço daqui é APENAS REFERÊNCIA (radar). O preço
 * comercial publicado no card continua vindo exclusivamente do motor VIA AIR.
 *
 * Nada aqui é usado pelo site público nem pelo motor de busca do cliente.
 */
import { scopeOfRoute } from "@/lib/br-airports";
import { nomeCompanhia } from "@/lib/melhores-destinos.parse";

const API = "https://passagensaereas.melhoresdestinos.com.br/api/v1";
const TWD = `${API}/twd/web`;
const SITE = "https://www.melhoresdestinos.com.br";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export class RadarCancelledError extends Error {
  constructor() {
    super("Radar de oportunidades cancelado");
    this.name = "RadarCancelledError";
  }
}

export type RadarCancel = () => boolean | Promise<boolean>;

/* ------------------------------------------------------------------ *
 * 33/34) RESILIÊNCIA: cache curto, fila, ritmo, retry, backoff, logs.
 * ------------------------------------------------------------------ */

export const RADAR_TTL = {
  /** categorias/origens mudam pouco */
  categories: 6 * 60 * 60 * 1000,
  /** destinos por categoria/origem */
  cities: 60 * 60 * 1000,
  /** ofertas, datas e preços: cache bem curto */
  offers: 10 * 60 * 1000,
};

const GAP_MS = 350;
const TIMEOUT_MS = 12_000;
const MAX_TRIES = 3;
const BACKOFF_MS = [800, 2_500, 6_000];

const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
let fila: Promise<unknown> = Promise.resolve();
let ultimaChamada = 0;

export const radarMetrics = {
  requests: 0,
  externalCalls: 0,
  cacheHits: 0,
  retries: 0,
  ok: 0,
  http4xx: 0,
  http5xx: 0,
  networkErrors: 0,
  categoriesChecked: 0,
  destinationsChecked: 0,
  opportunitiesFound: 0,
  // §22 — contadores de diagnóstico do radar
  md_categories_received: 0,
  md_destinations_received: 0,
  md_routes_received: 0,
  md_months_received: 0,
  md_dates_received: 0,
  md_dates_links_followed: 0,
  md_candidates_created: 0,
  md_candidates_deduplicated: 0,
  md_invalid_without_price: 0,
  md_invalid_without_route: 0,
  md_invalid_without_airline: 0,
  md_months_no_dates_available: 0,
  lastError: null as string | null,
  lastErrorAt: null as string | null,
};

export function resetRadarMetrics() {
  for (const k of Object.keys(radarMetrics) as Array<keyof typeof radarMetrics>) {
    if (typeof radarMetrics[k] === "number") (radarMetrics[k] as number) = 0;
  }
  radarMetrics.lastError = null;
  radarMetrics.lastErrorAt = null;
}

export function radarSourceMetrics(): Record<string, unknown> {
  return { ...radarMetrics };
}

/** Log técnico de erro externo (sem expor nada sensível ao frontend). */
function logErro(endpoint: string, status: number | null, etapa: string, msg: string) {
  radarMetrics.lastError = `${etapa}: ${msg}`;
  radarMetrics.lastErrorAt = new Date().toISOString();
  console.warn("[md-radar] erro", JSON.stringify({ endpoint, status, etapa, msg, ts: radarMetrics.lastErrorAt }));
}

async function checarCancelamento(cancel?: RadarCancel) {
  if (cancel && (await cancel())) throw new RadarCancelledError();
}

async function esperar(ms: number, cancel?: RadarCancel) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    await checarCancelamento(cancel);
    await new Promise((r) => setTimeout(r, Math.min(250, Math.max(1, fim - Date.now()))));
  }
  await checarCancelamento(cancel);
}

/** Fila única: uma requisição por vez, com ritmo entre chamadas. */
function enfileirar<T>(cancel: RadarCancel | undefined, fn: () => Promise<T>): Promise<T> {
  const proxima = fila.then(async () => {
    await checarCancelamento(cancel);
    const alvo = ultimaChamada + GAP_MS - Date.now();
    if (alvo > 0) await esperar(alvo, cancel);
    try {
      radarMetrics.externalCalls++;
      return await fn();
    } finally {
      ultimaChamada = Date.now();
    }
  });
  fila = proxima.catch(() => undefined);
  return proxima as Promise<T>;
}

type GetOptions = { ttlMs?: number; cancel?: RadarCancel; etapa?: string };

/** GET JSON com cache, coalescência, fila, retry limitado e backoff. */
async function getJson<T>(url: string, opts: GetOptions = {}): Promise<T> {
  const ttl = opts.ttlMs ?? RADAR_TTL.offers;
  const etapa = opts.etapa ?? "radar";
  radarMetrics.requests++;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) {
    radarMetrics.cacheHits++;
    return hit.value as T;
  }

  const emVoo = inflight.get(url);
  if (emVoo) return emVoo as Promise<T>;

  const p = (async () => {
    let ultimo: unknown = null;
    for (let tentativa = 0; tentativa < MAX_TRIES; tentativa++) {
      if (tentativa > 0) {
        radarMetrics.retries++;
        await esperar(BACKOFF_MS[tentativa - 1] ?? 3_000, opts.cancel);
      }
      await checarCancelamento(opts.cancel);
      try {
        const res = await enfileirar(opts.cancel, () =>
          fetch(url, {
            headers: {
              "user-agent": UA,
              accept: "application/json, text/plain, */*",
              "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
              referer: `${SITE}/`,
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }),
        );
        if (res.ok) {
          const json = (await res.json()) as T;
          radarMetrics.ok++;
          cache.set(url, { at: Date.now(), value: json });
          return json;
        }
        if (res.status >= 500) radarMetrics.http5xx++;
        else radarMetrics.http4xx++;
        logErro(url, res.status, etapa, `HTTP ${res.status}`);
        ultimo = new Error(`Melhores Destinos respondeu ${res.status}`);
      } catch (e) {
        if (e instanceof RadarCancelledError) throw e;
        radarMetrics.networkErrors++;
        const msg = e instanceof Error ? e.message : String(e);
        logErro(url, null, etapa, msg);
        ultimo = e;
      }
    }
    // cache vencido é melhor que nada (nunca vira preço VIA AIR)
    if (hit) return hit.value as T;
    throw ultimo instanceof Error ? ultimo : new Error("Falha no radar de oportunidades");
  })().finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p;
}

/* ------------------------------------------------------------------ *
 * NORMALIZAÇÃO
 * ------------------------------------------------------------------ */

/** Cidades multi-aeroporto do MD → aeroporto usado pelo motor VIA AIR. */
export const METRO_TO_AIRPORT: Record<string, string> = {
  SAO: "GRU", RIO: "GIG", BHZ: "CNF", ORL: "MCO", NYC: "JFK", WAS: "IAD",
  BUE: "EZE", MIL: "MXP", ROM: "FCO", PAR: "CDG", LON: "LHR", CHI: "ORD",
  TYO: "NRT", SPK: "CTS", BER: "BER", MOW: "SVO", STO: "ARN", OSA: "KIX",
};

export function normalizeIata(code: string): string {
  const c = String(code ?? "").trim().toUpperCase();
  return METRO_TO_AIRPORT[c] ?? c;
}

/** 15) Bagagem: mapper conservador — sem inventar despachada. */
export function normalizeBaggage(raw?: string | null): { code: string; label: string } {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return { code: "unknown", label: "Não informado" };
  if (v.includes("carry_on") || v.includes("hand")) return { code: "carry_on", label: "Bagagem de mão" };
  if (v.includes("checked") || v.includes("baggage") || v.includes("despach"))
    return { code: "checked", label: "Bagagem despachada" };
  if (v.includes("personal")) return { code: "personal_item", label: "Item pessoal" };
  // §12: código desconhecido nunca é inventado — vira "unknown" e o bruto é preservado.
  return { code: "unknown", label: "Não informado" };
}

/** 16) Companhia: mapeamento interno (não depende do ícone externo). */
/** §11 — mapper interno de companhias (a fonte ainda devolve códigos antigos). */
const AIRLINE_NAMES: Record<string, string> = {
  LA: "LATAM Airlines",
  JJ: "LATAM Airlines",
  AD: "Azul Linhas Aéreas",
  G3: "GOL Linhas Aéreas",
};

export function normalizeAirline(code?: string | null): { code: string | null; name: string | null } {
  const c = code ? String(code).trim().toUpperCase() : null;
  if (!c) return { code: null, name: null };
  return { code: c, name: AIRLINE_NAMES[c] ?? nomeCompanhia(c) };
}

function categoryIdFromLink(link?: string | null): number | null {
  const m = /category_id=(\d+)/.exec(String(link ?? ""));
  return m ? Number(m[1]) : null;
}

function iataFromItineraryLink(link?: string | null): { from: string | null; to: string | null } {
  const m = /itinerary_prices\/([A-Z]{3})\/([A-Z]{3})/i.exec(String(link ?? ""));
  return m ? { from: m[1]!.toUpperCase(), to: m[2]!.toUpperCase() } : { from: null, to: null };
}

/** Categoria "Brasil" (id 12) = nacional; as demais alimentam internacionais. */
const NATIONAL_CATEGORY_IDS = new Set([12]);
function categoryIsNational(id: number | null, name?: string | null): boolean {
  if (id != null && NATIONAL_CATEGORY_IDS.has(id)) return true;
  return String(name ?? "").trim().toLowerCase() === "brasil";
}

/* ------------------------------------------------------------------ *
 * TIPOS NORMALIZADOS DO RADAR (§31)
 * ------------------------------------------------------------------ */

export type RadarCategory = {
  id: number | null;
  name: string;
  cheapestPrice: number | null;
  national: boolean;
  link: string;
};

export type RadarLead = {
  source: "melhores_destinos";
  type: "national" | "international";
  scope: "nacional" | "internacional";
  categoryId: number | null;
  category: string | null;
  origin: { iata: string; city: string | null };
  destination: { iata: string; city: string | null };
  /** preço indicativo do MD nesse nível da API (triagem/priorização) */
  radarPrice: number | null;
  currency: "BRL";
  itineraryLink: string;
  collectedAt: string;
};

export type RadarOpportunity = RadarLead & {
  departureDate: string;
  returnDate: string | null;
  /** dias de permanência devolvidos pela fonte (dates[].stay) */
  stayDays: number | null;
  /** @deprecated use stayDays — mantido para compatibilidade do pipeline */
  nights: number | null;
  airlineCode: string | null;
  airlineName: string | null;
  airlineIconUrl: string | null;
  baggage: string;
  baggageRaw: string | null;
  baggageLabel: string;
  loyaltyProgram: string | null;
  provider: string | null;
  providerDisplay: string | null;
  externalUrl: string | null;
  /** §18 — metadado bruto do radar, sem conversão para classe VIA AIR */
  radarBookingClassRaw: string | null;
  /** §17 — fornecedores/preços observados para a MESMA oportunidade */
  radarSources: Array<{ provider: string | null; price: number }>;
  /** §16 — fingerprint de deduplicação antes da consulta VIA AIR */
  fingerprint: string;
};

/* ------------------------------------------------------------------ *
 * 5/6) NAVEGAÇÃO DA API
 * ------------------------------------------------------------------ */

type RawCategories = {
  from_city_name?: string | null;
  to_city_name?: string | null;
  month?: string | null;
  categories?: Array<{
    name?: string;
    description?: string | null;
    relevance?: number | null;
    cheapest_itinerary_price?: number | null;
    cheapest_itinerary_price_found_at?: string | null;
    image?: string | null;
    link?: string;
  }>;
  cities?: Array<{
    from_city_name?: string | null;
    to_city_name?: string | null;
    total_price?: number | null;
    link?: string;
  }>;
};

type RawItinerary = {
  from_city_name?: string | null;
  from_iata_code?: string | null;
  to_city_name?: string | null;
  to_iata_code?: string | null;
  month?: string | null;
  date_from?: string | null;
  date_until?: string | null;
  min_stay?: number | null;
  max_stay?: number | null;
  booking_class?: string | null;
  months?: Array<{
    month?: string;
    year?: number;
    price?: number | null;
    price_currency?: string | null;
    cheapest?: boolean;
    dates_link?: string | null;
    dates?: RawDate[] | null;
  }> | null;
};

type RawDate = {
  luggage_type?: string | null;
  loyalty_program?: string | null;
  departure?: string | null;
  departure_txt?: string | null;
  arrival?: string | null;
  arrival_txt?: string | null;
  stay?: number | null;
  price?: number | null;
  price_currency?: string | null;
  airline_code?: string | null;
  airline_icon_url?: string | null;
  link?: string | null;
  provider_name?: string | null;
  website_display?: string | null;
};

/** Etapa 1 — categorias (opcionalmente já filtradas pela origem). */
export async function radarCategories(
  origin?: string,
  opts?: { cancel?: RadarCancel },
): Promise<RadarCategory[]> {
  const params = new URLSearchParams();
  if (origin) params.set("from_iata_code", origin.toUpperCase());
  const url = `${TWD}/categories${params.toString() ? `?${params}` : ""}`;
  const json = await getJson<RawCategories>(url, {
    ttlMs: RADAR_TTL.categories,
    cancel: opts?.cancel,
    etapa: "categories",
  });
  const cats = (json.categories ?? []).map((c) => {
    const id = categoryIdFromLink(c.link);
    return {
      id,
      name: String(c.name ?? "").trim(),
      cheapestPrice: typeof c.cheapest_itinerary_price === "number" ? c.cheapest_itinerary_price : null,
      national: categoryIsNational(id, c.name),
      link: String(c.link ?? url),
    } satisfies RadarCategory;
  });
  radarMetrics.categoriesChecked += cats.length;
  radarMetrics.md_categories_received += cats.length;
  return cats;
}

/** 7) Endpoint de origens — normalização/resolução city_name ↔ IATA. */
export async function radarOrigins(opts?: { cancel?: RadarCancel }): Promise<
  Array<{
    iata: string;
    cityIata: string | null;
    city: string;
    state: string | null;
    country: string | null;
    airportName: string | null;
  }>
> {
  try {
    const json = await getJson<{
      origins?: Array<{
        iata_code?: string;
        iata_city_code?: string | null;
        city_name?: string;
        state?: string | null;
        country?: string | null;
        airport_name?: string | null;
      }>;
    }>(`${API}/airports/origins`, {
      ttlMs: RADAR_TTL.categories,
      cancel: opts?.cancel,
      etapa: "origins",
    });
    return (json.origins ?? [])
      .filter((o) => o?.iata_code && o?.city_name)
      .map((o) => ({
        iata: o.iata_code!.toUpperCase(),
        cityIata: o.iata_city_code ? o.iata_city_code.toUpperCase() : null,
        city: o.city_name!,
        state: o.state ?? null,
        country: o.country ?? null,
        airportName: o.airport_name ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * Etapas 2/6 — destinos monitorados de uma origem, categoria por categoria.
 * Segue sempre o `link` devolvido pela própria API (nada de URL inventada).
 */
export async function radarLeadsForOrigin(
  origin: string,
  opts?: { cancel?: RadarCancel; onProgress?: (msg: string) => void; deadline?: number },
): Promise<RadarLead[]> {
  const from = origin.trim().toUpperCase();
  const cancel = opts?.cancel;
  const semTempo = () => !!opts?.deadline && Date.now() >= opts.deadline;
  const collectedAt = new Date().toISOString();
  const leads = new Map<string, RadarLead>();

  let categorias: RadarCategory[] = [];
  try {
    categorias = await radarCategories(from, { cancel });
  } catch (e) {
    if (e instanceof RadarCancelledError) throw e;
    // falha real da fonte precisa aparecer no diagnóstico (não vira lista vazia)
    throw e;
  }

  for (const cat of categorias) {
    if (semTempo()) break;
    await checarCancelamento(cancel);
    opts?.onProgress?.(`Radar ${from} — ${cat.name}`);

    const params = new URLSearchParams({ from_iata_code: from });
    if (cat.id) params.set("category_id", String(cat.id));
    let json: RawCategories;
    try {
      json = await getJson<RawCategories>(`${TWD}/categories?${params}`, {
        ttlMs: RADAR_TTL.cities,
        cancel,
        etapa: "categories:cities",
      });
    } catch (e) {
      if (e instanceof RadarCancelledError) throw e;
      // uma categoria problemática não derruba a coleta inteira
      continue;
    }

    for (const city of json.cities ?? []) {
      const { from: linkFrom, to } = iataFromItineraryLink(city.link);
      if (!to || !city.link) {
        radarMetrics.md_invalid_without_route++;
        continue;
      }
      const originIata = normalizeIata(linkFrom ?? from);
      const destination = normalizeIata(to);
      if (destination.length !== 3 || destination === originIata) continue;
      radarMetrics.destinationsChecked++;
      radarMetrics.md_destinations_received++;
      radarMetrics.md_routes_received++;

      const preco = typeof city.total_price === "number" ? city.total_price : null;
      // Categoria "Brasil" do MD manda: destino da categoria nacional é
      // sempre nacional (evita Bonito/BYO virar "internacional" só porque o
      // IATA não estava na lista local).
      const scope: "nacional" | "internacional" = cat.national
        ? "nacional"
        : scopeOfRoute(originIata, destination);
      const national = scope === "nacional";
      const atual = leads.get(destination);
      if (atual && (atual.radarPrice ?? Infinity) <= (preco ?? Infinity)) continue;

      leads.set(destination, {
        source: "melhores_destinos",
        type: scope === "nacional" ? "national" : "international",
        scope,
        categoryId: cat.id,
        category: cat.name || null,
        origin: { iata: originIata, city: city.from_city_name ?? json.from_city_name ?? null },
        destination: { iata: destination, city: city.to_city_name ?? null },
        radarPrice: preco,
        currency: "BRL",
        itineraryLink: String(city.link),
        collectedAt,
      });
    }
  }

  return [...leads.values()];
}

/**
 * §15 — CAMINHO OFICIAL DA API (usado quando o atalho por origem não devolve
 * nada): categorias → destinos da categoria → origens disponíveis daquele
 * destino → link do itinerário. Sempre seguindo o `link` devolvido pela
 * própria resposta, nunca montando URL por suposição.
 */
export async function radarLeadsByCategory(
  monitoredOrigins: string[],
  opts?: { cancel?: RadarCancel; onProgress?: (msg: string) => void; deadline?: number },
): Promise<RadarLead[]> {
  const cancel = opts?.cancel;
  const semTempo = () => !!opts?.deadline && Date.now() >= opts.deadline;
  const collectedAt = new Date().toISOString();
  const permitidas = new Set(monitoredOrigins.map((o) => normalizeIata(o)));
  const leads = new Map<string, RadarLead>();

  let categorias: RadarCategory[] = [];
  try {
    categorias = await radarCategories(undefined, { cancel });
  } catch (e) {
    if (e instanceof RadarCancelledError) throw e;
    throw e;
  }

  for (const cat of categorias) {
    if (semTempo()) break;
    await checarCancelamento(cancel);
    opts?.onProgress?.(`Radar — ${cat.name}`);
    let destinos: RawCategories;
    try {
      destinos = await getJson<RawCategories>(cat.link, {
        ttlMs: RADAR_TTL.cities,
        cancel,
        etapa: "categories:destinations",
      });
    } catch (e) {
      if (e instanceof RadarCancelledError) throw e;
      continue;
    }

    for (const destino of destinos.cities ?? []) {
      if (semTempo()) break;
      if (!destino?.link) {
        radarMetrics.md_invalid_without_route++;
        continue;
      }
      radarMetrics.md_destinations_received++;
      let origens: RawCategories;
      try {
        origens = await getJson<RawCategories>(destino.link, {
          ttlMs: RADAR_TTL.cities,
          cancel,
          etapa: "categories:origins",
        });
      } catch (e) {
        if (e instanceof RadarCancelledError) throw e;
        continue;
      }

      for (const rota of origens.cities ?? []) {
        const { from, to } = iataFromItineraryLink(rota?.link);
        if (!from || !to || !rota?.link) {
          radarMetrics.md_invalid_without_route++;
          continue;
        }
        const originIata = normalizeIata(from);
        const destinationIata = normalizeIata(to);
        if (!permitidas.has(originIata) || originIata === destinationIata) continue;
        radarMetrics.md_routes_received++;

        const preco = typeof rota.total_price === "number" ? rota.total_price : null;
        const scope: "nacional" | "internacional" =
          cat.national && scopeOfRoute(originIata, destinationIata) === "nacional"
            ? "nacional"
            : scopeOfRoute(originIata, destinationIata);
        const chave = `${originIata}|${destinationIata}`;
        const atual = leads.get(chave);
        if (atual && (atual.radarPrice ?? Infinity) <= (preco ?? Infinity)) continue;

        leads.set(chave, {
          source: "melhores_destinos",
          type: scope === "nacional" ? "national" : "international",
          scope,
          categoryId: cat.id,
          category: cat.name || null,
          origin: { iata: originIata, city: rota.from_city_name ?? null },
          destination: {
            iata: destinationIata,
            city: rota.to_city_name ?? destinos.to_city_name ?? destino.to_city_name ?? null,
          },
          radarPrice: preco,
          currency: "BRL",
          itineraryLink: String(rota.link),
          collectedAt,
        });
      }
    }
  }

  return [...leads.values()];
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

/** "15/10" + mês/ano de referência → "2026-10-15" (vira o ano quando precisa). */
function toIso(label: string | null | undefined, year: number, monthIndex: number): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(label ?? "").trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (!dia || !mes) return null;
  // volta em janeiro depois de uma ida em dezembro
  const ano = mes < monthIndex ? year + 1 : year;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/**
 * Etapa 8 — ofertas/datas concretas de uma rota descoberta.
 * Devolve oportunidades JÁ NORMALIZADAS (preço aqui é só referência).
 */
export async function radarOpportunitiesForLead(
  lead: RadarLead,
  count = 1,
  opts?: { cancel?: RadarCancel; maxMonths?: number },
): Promise<RadarOpportunity[]> {
  const cancel = opts?.cancel;
  let itinerario: RawItinerary;
  try {
    itinerario = await getJson<RawItinerary>(lead.itineraryLink, {
      ttlMs: RADAR_TTL.offers,
      cancel,
      etapa: "itinerary_prices",
    });
  } catch (e) {
    if (e instanceof RadarCancelledError) throw e;
    return [];
  }

  const bookingClassRaw = itinerario.booking_class ?? null;

  const meses = (Array.isArray(itinerario.months) ? itinerario.months : [])
    .filter((m) => !!m && typeof m.price === "number" && m.price! > 0)
    .sort((a, b) => {
      if (a.cheapest && !b.cheapest) return -1;
      if (b.cheapest && !a.cheapest) return 1;
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    })
    .slice(0, Math.max(1, opts?.maxMonths ?? 2));
  radarMetrics.md_months_received += meses.length;

  const hoje = isoToday();
  /** §16/§17 — um candidato por fingerprint, guardando os fornecedores. */
  const porFingerprint = new Map<string, RadarOpportunity>();

  for (const mes of meses) {
    let datas: RawDate[] = Array.isArray(mes.dates) ? mes.dates : [];
    // §7 — dates: null NUNCA significa "sem ofertas": segue o dates_link.
    if (!datas.length && mes.dates_link) {
      radarMetrics.md_dates_links_followed++;
      try {
        const det = await getJson<RawItinerary>(mes.dates_link, {
          ttlMs: RADAR_TTL.offers,
          cancel,
          etapa: "itinerary_prices:dates",
        });
        datas = (Array.isArray(det?.months) ? det.months : []).flatMap((m) =>
          Array.isArray(m?.dates) ? m.dates! : [],
        );
      } catch (e) {
        if (e instanceof RadarCancelledError) throw e;
        datas = [];
      }
    }
    if (!datas.length) {
      // §20 — mês sem ofertas disponíveis: registra e segue adiante.
      radarMetrics.md_months_no_dates_available++;
      continue;
    }
    radarMetrics.md_dates_received += datas.length;

    const mesIndex = MESES[String(mes.month ?? "").slice(0, 3).toLowerCase()] ?? 1;
    const ano = mes.year ?? new Date().getFullYear();

    for (const d of datas) {
      if (!d) continue;
      // §20 — oferta sem preço não é oportunidade válida.
      if (typeof d.price !== "number" || !(d.price > 0)) {
        radarMetrics.md_invalid_without_price++;
        continue;
      }
      const ida = toIso(d.departure, ano, mesIndex);
      if (!ida || ida < hoje) continue;
      const voltaBruta = toIso(d.arrival, ano, mesIndex);
      const volta = voltaBruta && voltaBruta >= ida ? voltaBruta : null;
      const cia = normalizeAirline(d.airline_code);
      if (!cia.code) {
        radarMetrics.md_invalid_without_airline++;
        continue;
      }
      const bag = normalizeBaggage(d.luggage_type);
      const fingerprint = [
        "melhores_destinos",
        lead.origin.iata,
        lead.destination.iata,
        ida,
        volta ?? "-",
        cia.code,
      ].join("|");

      const existente = porFingerprint.get(fingerprint);
      if (existente) {
        // §17 — mesma rota/data/cia em vários fornecedores: fica o MENOR preço.
        radarMetrics.md_candidates_deduplicated++;
        existente.radarSources.push({ provider: d.provider_name ?? null, price: d.price });
        existente.radarSources.sort((a, b) => a.price - b.price);
        if (d.price < (existente.radarPrice ?? Infinity)) {
          existente.radarPrice = d.price;
          existente.provider = d.provider_name ?? null;
          existente.providerDisplay = d.website_display ?? null;
          existente.externalUrl = d.link ?? null;
        }
        continue;
      }

      porFingerprint.set(fingerprint, {
        ...lead,
        departureDate: ida,
        returnDate: volta,
        stayDays: typeof d.stay === "number" ? d.stay : null,
        nights: typeof d.stay === "number" ? d.stay : null,
        airlineCode: cia.code,
        airlineName: cia.name,
        airlineIconUrl: d.airline_icon_url ?? null,
        baggage: bag.code,
        baggageRaw: d.luggage_type ?? null,
        baggageLabel: bag.label,
        loyaltyProgram: d.loyalty_program ?? null,
        // §10 — o preço do radar é dates[].price, sempre em BRL.
        radarPrice: d.price,
        currency: "BRL",
        provider: d.provider_name ?? null,
        providerDisplay: d.website_display ?? null,
        externalUrl: d.link ?? null,
        radarBookingClassRaw: bookingClassRaw,
        radarSources: [{ provider: d.provider_name ?? null, price: d.price }],
        fingerprint,
      });
    }
  }

  const ofertas = [...porFingerprint.values()]
    .sort((a, b) => (a.radarPrice ?? Infinity) - (b.radarPrice ?? Infinity))
    .slice(0, Math.max(1, count));
  radarMetrics.opportunitiesFound += ofertas.length;
  radarMetrics.md_candidates_created += ofertas.length;
  return ofertas;
}

/** Utilitário de concorrência controlada usado pelo pipeline. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[];
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]!);
      } catch (e) {
        if (e instanceof RadarCancelledError) throw e;
        out[idx] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return out.filter((r) => r !== undefined);
}
