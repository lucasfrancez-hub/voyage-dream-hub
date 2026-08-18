/**
 * Importação REAL do Orçamento Web da Infotravel.
 * SERVER-ONLY.
 *
 * A página `/orcamento-web/pt/link?token=...` é um Next.js cuja hidratação
 * (`__NEXT_DATA__`) contém apenas `companyCode`, `bookingId`, `bookingIndex` e
 * `url`. Todo o conteúdo (opções, hotéis, voos, valores, passageiros) é
 * carregado pelo front-end via tRPC:
 *
 *   GET /orcamento-web/api/trpc/main.getBooking?input={"json":{
 *         "companyCode":"FRT","bookingId":503238,"clientUrl":"<url da página>"}}
 *
 * Cada item de `bookingPackages` é UMA opção comercial (Orçamento 1..N).
 * Nada de OCR, nada de scraping por classe CSS.
 */
import { collectBaggageText } from "./baggage";
import {
  emptyOption,
  emptyQuote,
  optionHasProducts,
  type NormalizedFlight,
  type NormalizedGenericItem,
  type NormalizedHotel,
  type NormalizedOption,
  type NormalizedQuote,
} from "./types";

export type QuoteParseErrorCode =
  | "SOURCE_PAGE_INVALID"
  | "SOURCE_PAGE_NOT_LOADED"
  | "INFOTRAVEL_DATA_ENDPOINT_FAILED"
  | "NO_OPTIONS_FOUND"
  | "NO_PRODUCTS_FOUND"
  | "TOTAL_NOT_FOUND"
  | "PASSENGERS_NOT_FOUND"
  | "OPTION_PARSE_FAILED";

export class QuoteParseError extends Error {
  code: QuoteParseErrorCode;
  detail?: string;
  constructor(code: QuoteParseErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;

const log = (...a: unknown[]) => console.log("[Via Air Orçamentos]", ...a);

export type InfotravelRef = {
  companyCode: string;
  bookingId: number;
  bookingIndex: number | null;
  clientUrl: string;
  origin: string;
  basePath: string;
};

/** Lê a hidratação do Next para descobrir companyCode/bookingId. */
export function readNextData(html: string): Record<string, unknown> | null {
  const m = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Corrige links quebrados vindos das planilhas: espaços, protocolo digitado
 * errado ("hhttps://", "htps://"), link sem protocolo e aspas residuais.
 * Sem isso o `new URL()` gera origin "null" e o endpoint vira "null/orcamento-web/...".
 */
export function normalizarUrlOrcamento(raw: string): string {
  let s = String(raw ?? "").trim().replace(/^["'<]+|["'>]+$/g, "").replace(/\s+/g, "");
  s = s.replace(/^h+ttps?:\/\//i, (m) => (/s:\/\//i.test(m) ? "https://" : "http://"));
  s = s.replace(/^htt?ps?:\/{1,}/i, (m) => (/s:/i.test(m) ? "https://" : "http://"));
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;
  return s;
}

/**
 * Devolve o link do Orçamento Web utilizável (com companyCode/bookingId) ou
 * null quando o link só abre a área logada da Cativa/Infotravel.
 */
export function linkOrcamentoUtilizavel(raw: string): string | null {
  const url = normalizarUrlOrcamento(raw);
  try {
    resolveRef(url);
    return url;
  } catch {
    return null;
  }
}



/** Descobre a referência do orçamento a partir da URL (e do HTML, quando disponível). */
export function resolveRef(rawUrl: string, html?: string): InfotravelRef {
  const url = normalizarUrlOrcamento(rawUrl);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new QuoteParseError("SOURCE_PAGE_INVALID", "url inválida");
  }
  if (!u.origin || u.origin === "null") {
    throw new QuoteParseError("SOURCE_PAGE_INVALID", "origem da url inválida");
  }
  const basePath = u.pathname.startsWith("/orcamento-web") ? "/orcamento-web" : "";

  let companyCode: string | null = null;
  let bookingId: number | null = null;
  let bookingIndex: number | null = null;

  if (html) {
    const next = readNextData(html);
    const pageProps = ((next?.props as Record<string, unknown> | undefined)?.pageProps ?? {}) as Record<string, unknown>;
    if (typeof pageProps.companyCode === "string") companyCode = pageProps.companyCode;
    if (typeof pageProps.bookingId === "number") bookingId = pageProps.bookingId;
    if (typeof pageProps.bookingIndex === "number") bookingIndex = pageProps.bookingIndex;
  }

  // fallback: token base64 no formato "FRT | 503238 | HASH"
  if (!companyCode || !bookingId) {
    const token =
      u.searchParams.get("token") ??
      u.searchParams.get("t") ??
      u.searchParams.get("hash") ??
      // alguns links trazem o token no final do path
      (u.pathname.split("/").filter(Boolean).pop() ?? null);
    if (token) {
      try {
        const rawToken = decodeURIComponent(token)
          .replace(/\s/g, "+")
          // base64 url-safe
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        let decoded = "";
        try {
          decoded = atob(rawToken);
        } catch {
          // Algumas planilhas trazem um caractere residual no fim do Base64.
          // Recupera somente o prefixo válido que contém empresa e bookingId.
          const base64 = rawToken.match(/^[A-Za-z0-9+/]+/)?.[0] ?? "";
          for (let end = base64.length; end >= 8 && !decoded; end--) {
            try {
              const candidate = base64.slice(0, end);
              decoded = atob(candidate + "=".repeat((4 - (candidate.length % 4)) % 4));
            } catch {
              // continua removendo apenas o sufixo inválido
            }
          }
        }
        const parts = decoded.split("|").map((p) => p.trim());
        if (!companyCode && parts[0]) companyCode = parts[0];
        if (!bookingId && parts[1] && /^\d+$/.test(parts[1])) bookingId = Number(parts[1]);
        if (!bookingId) {
          const n = decoded.match(/(\d{4,})/)?.[1];
          if (n) bookingId = Number(n);
        }
      } catch {
        /* token não é base64 */
      }
    }
  }

  // último recurso: parâmetros explícitos na querystring
  if (!bookingId) {
    const q = u.searchParams.get("bookingId") ?? u.searchParams.get("booking");
    if (q && /^\d+$/.test(q)) bookingId = Number(q);
  }
  if (!companyCode) {
    const q = u.searchParams.get("companyCode") ?? u.searchParams.get("company");
    if (q) companyCode = q;
  }

  if (!companyCode || !bookingId) {
    throw new QuoteParseError("SOURCE_PAGE_INVALID", "companyCode/bookingId não encontrados");
  }
  return { companyCode, bookingId, bookingIndex, clientUrl: url, origin: u.origin, basePath };
}


async function trpc<T>(ref: InfotravelRef, procedure: string, input: Record<string, unknown>): Promise<T> {
  const qs = encodeURIComponent(JSON.stringify({ json: input }));
  const endpoint = `${ref.origin}${ref.basePath}/api/trpc/${procedure}?input=${qs}`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new QuoteParseError("INFOTRAVEL_DATA_ENDPOINT_FAILED", `${procedure}: ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new QuoteParseError("INFOTRAVEL_DATA_ENDPOINT_FAILED", `${procedure}: http_${res.status}`);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new QuoteParseError("INFOTRAVEL_DATA_ENDPOINT_FAILED", `${procedure}: resposta não-JSON`);
  }
  const err = (body as { error?: { json?: unknown } }).error;
  if (err) throw new QuoteParseError("INFOTRAVEL_DATA_ENDPOINT_FAILED", `${procedure}: erro tRPC`);
  const data = (body as { result?: { data?: { json?: T } } }).result?.data?.json;
  if (data == null) throw new QuoteParseError("INFOTRAVEL_DATA_ENDPOINT_FAILED", `${procedure}: sem payload`);
  return data;
}

// ---------------------------------------------------------------- helpers

type Price = { currency?: string | null; amount?: number | null } | null | undefined;
const amountOf = (p: Price): number | null =>
  p && typeof p.amount === "number" && Number.isFinite(p.amount) ? p.amount : null;

function sumFares(fares: { type?: string; discount?: boolean; price?: Price }[] | null | undefined): number | null {
  if (!fares?.length) return null;
  let total = 0;
  let found = false;
  for (const f of fares) {
    const v = amountOf(f.price);
    if (v == null) continue;
    found = true;
    total += f.discount ? -Math.abs(v) : v;
  }
  return found ? Math.round(total * 100) / 100 : null;
}

function splitFlightFares(
  fares: { type?: string; discount?: boolean; isFareRate?: boolean; price?: Price }[] | null | undefined,
): { fare: number | null; taxes: number | null; total: number | null } {
  if (!fares?.length) return { fare: null, taxes: null, total: null };
  let fare = 0;
  let taxes = 0;
  let foundFare = false;
  let foundTaxes = false;
  for (const item of fares) {
    const amount = amountOf(item.price);
    if (amount == null) continue;
    const value = item.discount ? -Math.abs(amount) : amount;
    const type = String(item.type ?? "").toUpperCase();
    if (item.isFareRate === true || type !== "FARE") {
      taxes += value;
      foundTaxes = true;
    } else {
      fare += value;
      foundFare = true;
    }
  }
  const roundedFare = foundFare ? Math.round(fare * 100) / 100 : null;
  const roundedTaxes = foundTaxes ? Math.round(taxes * 100) / 100 : null;
  return {
    fare: roundedFare,
    taxes: roundedTaxes,
    total: foundFare || foundTaxes ? Math.round((fare + taxes) * 100) / 100 : null,
  };
}

const isoDate = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : v;
};

const dayDiff = (a?: string | null, b?: string | null): number | null => {
  if (!a || !b) return null;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return null;
  const n = Math.round((d2 - d1) / 86_400_000);
  return n > 0 ? n : null;
};

const cleanText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null;

// ---------------------------------------------------------------- mapping

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapHotel(bh: any): { hotel: NormalizedHotel; pax: { adults: number; children: number } } {
  const hotel = bh?.hotel ?? {};
  const rooms: any[] = Array.isArray(bh?.rooms) ? bh.rooms : [];
  const first = rooms[0] ?? {};
  const checkin = isoDate(first.checkIn);
  const checkout = isoDate(first.checkOut);

  let adults = 0;
  let children = 0;
  for (const r of rooms) {
    for (const n of (r?.names ?? []) as any[]) {
      if (String(n?.type ?? "").toUpperCase() === "CHD" || (typeof n?.age === "number" && n.age < 12)) children += 1;
      else adults += 1;
    }
  }

  const total = rooms.reduce<number | null>((acc, r) => {
    const v = sumFares(r?.fares);
    return v == null ? acc : (acc ?? 0) + v;
  }, null);

  const photos = ((hotel?.images ?? []) as any[])
    .map((i) => i?.large ?? i?.medium ?? i?.small)
    .filter((s): s is string => typeof s === "string");

  const cancel = first?.cancellationPolicies;
  const notes: string[] = [];
  if (cancel?.refundable === false) notes.push("Tarifa não reembolsável");
  for (const p of (cancel?.penalties ?? []) as any[]) {
    const d = cleanText(p?.description);
    if (d && !notes.includes(d)) notes.push(d);
  }

  return {
    hotel: {
      name: cleanText(hotel?.name) ?? "Hospedagem",
      city: cleanText(hotel?.address?.city?.name),
      address: cleanText(hotel?.address?.address),
      checkin,
      checkout,
      nights: dayDiff(checkin, checkout),
      roomDescription:
        [cleanText(first?.roomType?.name), notes.join(" • ") || null].filter(Boolean).join(" — ") || null,
      board: cleanText(first?.boardType?.name),
      photos,
      latitude: typeof hotel?.address?.coordinates?.latitude === "number" ? hotel.address.coordinates.latitude : null,
      longitude:
        typeof hotel?.address?.coordinates?.longitude === "number" ? hotel.address.coordinates.longitude : null,
      total,
    },
    pax: { adults, children },
  };
}

function mapFlight(bf: any): { flights: NormalizedFlight[]; pax: { adults: number; children: number }; total: number | null } {
  const out: NormalizedFlight[] = [];
  const groups: any[] = Array.isArray(bf?.flights) ? bf.flights : [];
  for (const g of groups) {
    const segments: any[] = Array.isArray(g?.segments) ? g.segments : [];
    const segs = segments.map((s) => ({
      airline: cleanText(s?.airline?.name ?? s?.airline),
      airlineIata: cleanText(s?.airline?.code ?? s?.airlineCode),
      flightNumber: cleanText(s?.flightNumber ?? s?.number),
      fromIata: cleanText(s?.departureAirport?.code ?? s?.origin?.code ?? s?.from),
      fromCity: cleanText(
        s?.departureAirport?.city?.name ??
          s?.departureAirport?.city ??
          s?.departureAirport?.cityName ??
          s?.origin?.city?.name ??
          s?.origin?.city ??
          s?.departureAirport?.name,
      ),
      toIata: cleanText(s?.arrivalAirport?.code ?? s?.destination?.code ?? s?.to),
      toCity: cleanText(
        s?.arrivalAirport?.city?.name ??
          s?.arrivalAirport?.city ??
          s?.arrivalAirport?.cityName ??
          s?.destination?.city?.name ??
          s?.destination?.city ??
          s?.arrivalAirport?.name,
      ),
      departure: isoDate(s?.departure),
      arrival: isoDate(s?.arrival),
      duration: cleanText(s?.duration),
      cabin: cleanText(s?.cabin ?? s?.class ?? g?.class),
      fareClass: cleanText(s?.fareClass ?? s?.fareBasis ?? s?.family ?? g?.fareClass ?? g?.family),
      aircraft: cleanText(s?.equipment ?? s?.aircraft),
      baggage: collectBaggageText(s, g, bf?.baggage, bf?.baggages) ?? cleanText(s?.baggage?.description ?? g?.baggage?.description),
    }));
    if (!segs.length) continue;
    out.push({
      direction: out.length === 0 ? "OUTBOUND" : "INBOUND",
      airline: segs[0]!.airline,
      fromIata: segs[0]!.fromIata,
      toIata: segs[segs.length - 1]!.toIata,
      departure: segs[0]!.departure,
      arrival: segs[segs.length - 1]!.arrival,
      duration: cleanText(g?.duration),
      stops: Math.max(0, segs.length - 1),
      segments: segs,
      total: sumFares(g?.fares) ?? null,
    });
  }
  const travellers: any[] = Array.isArray(bf?.travellers) ? bf.travellers : Array.isArray(bf?.names) ? bf.names : [];
  let adults = 0;
  let children = 0;
  for (const t of travellers) {
    if (String(t?.type ?? "").toUpperCase() === "CHD") children += 1;
    else adults += 1;
  }
  const breakdown = splitFlightFares(bf?.fares);
  const passengerCount = Math.max(1, adults + children);
  if (out[0]) {
    out[0].fare = breakdown.fare == null ? null : Math.round((breakdown.fare / passengerCount) * 100) / 100;
    out[0].taxes = breakdown.taxes == null ? null : Math.round((breakdown.taxes / passengerCount) * 100) / 100;
  }
  return { flights: out, pax: { adults, children }, total: breakdown.total };
}

/**
 * O payload da Infotravel aninha o produto em chaves diferentes por tipo
 * (`servicePackage`, `other`, `transfer`, `tour`, `ticket`, `insurance`...).
 * Percorremos o próprio item e seus objetos filhos para achar nome/descrição.
 */
function nosDoItem(entry: any): any[] {
  const nos = [entry];
  for (const v of Object.values(entry ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) nos.push(v);
  }
  return nos;
}

function primeiroTexto(nos: any[], chaves: string[]): string | null {
  for (const no of nos) {
    for (const k of chaves) {
      const t = cleanText(no?.[k]);
      if (t) return t;
    }
  }
  return null;
}

function mapGeneric(entry: any, fallbackName: string): NormalizedGenericItem | null {
  if (!entry) return null;
  const nos = nosDoItem(entry);
  const name = primeiroTexto(nos, ["name", "title", "model", "productName"]) ?? fallbackName;
  const total =
    sumFares(entry?.fares) ??
    amountOf(entry?.price) ??
    amountOf(entry?.amount) ??
    sumFares(entry?.transfer?.fares) ??
    (() => {
      for (const no of nos) {
        const v = sumFares(no?.fares) ?? amountOf(no?.price) ?? amountOf(no?.amount);
        if (v != null) return v;
      }
      return null;
    })() ??
    null;
  return {
    name,
    description: primeiroTexto(nos, [
      "description",
      "observation",
      "observations",
      "remarks",
      "notes",
      "details",
      "content",
    ]),
    date: isoDate(
      entry?.date ??
        entry?.transfer?.date ??
        entry?.startDate ??
        entry?.pickUp?.date ??
        nos.map((n) => n?.date ?? n?.startDate).find(Boolean),
    ),
    quantity: typeof entry?.quantity === "number" ? entry.quantity : null,
    total,
  };
}

const GENERIC_MAP: { key: string; target: keyof NormalizedOption; label: string }[] = [
  { key: "bookingTransfers", target: "transfers", label: "Transfer" },
  { key: "bookingVehicles", target: "cars", label: "Locação de veículo" },
  { key: "bookingTours", target: "activities", label: "Passeio" },
  { key: "bookingExperiences", target: "activities", label: "Experiência" },
  { key: "bookingCircuits", target: "activities", label: "Circuito" },
  { key: "bookingTickets", target: "tickets", label: "Ingresso" },
  { key: "bookingInsurances", target: "insurance", label: "Seguro viagem" },
  { key: "bookingServicePackages", target: "services", label: "Serviço" },
  { key: "bookingServiceOthers", target: "services", label: "Serviço" },
  { key: "bookingChips", target: "services", label: "Chip internacional" },
  { key: "bookingBusList", target: "services", label: "Rodoviário" },
  { key: "bookingTrains", target: "services", label: "Trem" },
];

/**
 * Soma todos os itens de taxa (`fares` que não são a tarifa em si) de qualquer
 * produto do pacote: aéreo, hotel, serviços, seguros etc.
 */
function somarTaxasDoPacote(pkg: any): number | null {
  let total = 0;
  let achou = false;
  const visto = new Set<any>();
  const anda = (no: any) => {
    if (!no || typeof no !== "object" || visto.has(no)) return;
    visto.add(no);
    if (Array.isArray(no)) {
      for (const item of no) anda(item);
      return;
    }
    if (Array.isArray(no.fares)) {
      for (const f of no.fares as any[]) {
        const amount = amountOf(f?.price);
        if (amount == null) continue;
        const tipo = String(f?.type ?? "").toUpperCase();
        const ehTaxa = f?.isFareRate === true || (tipo !== "FARE" && tipo !== "");
        if (!ehTaxa) continue;
        total += f?.discount ? -Math.abs(amount) : amount;
        achou = true;
      }
    }
    for (const v of Object.values(no)) if (v && typeof v === "object") anda(v);
  };
  anda(pkg);
  if (!achou) return null;
  const r = Math.round(total * 100) / 100;
  return r > 0 ? r : null;
}

function mapOption(pkg: any, index: number): { option: NormalizedOption; pax: { adults: number; children: number } } {
  const option = emptyOption(index + 1);
  option.label = cleanText(pkg?.package?.name) ?? `Opção ${index + 1}`;
  option.destination = cleanText(pkg?.package?.destination);
  option.sourceReference = pkg?.id != null ? String(pkg.id) : null;

  let adults = 0;
  let children = 0;
  const notes = new Set<string>();

  for (const bh of (pkg?.bookingHotels ?? []) as any[]) {
    const { hotel, pax } = mapHotel(bh);
    option.hotels.push(hotel);
    adults = Math.max(adults, pax.adults);
    children = Math.max(children, pax.children);
    const t = cleanText(bh?.textDoc);
    if (t) notes.add(t);
  }

  for (const bf of (pkg?.bookingFlights ?? []) as any[]) {
    const { flights, pax, total } = mapFlight(bf);
    // O valor do aéreo normalmente vem no nível da reserva (bf.fares), não por
    // trecho: sem isto o total da opção sai só com a hospedagem.
    if (total != null && !flights.some((f) => typeof f.total === "number") && flights[0]) {
      flights[0].total = total;
    }
    option.flights.push(...flights);
    adults = Math.max(adults, pax.adults);
    children = Math.max(children, pax.children);
  }

  for (const g of GENERIC_MAP) {
    for (const entry of (pkg?.[g.key] ?? []) as any[]) {
      const item = mapGeneric(entry, g.label);
      if (item) (option[g.target] as NormalizedGenericItem[]).push(item);
    }
  }

  // datas da opção
  const dates: string[] = [];
  for (const h of option.hotels) {
    if (h.checkin) dates.push(h.checkin);
    if (h.checkout) dates.push(h.checkout);
  }
  for (const f of option.flights) {
    if (f.departure) dates.push(f.departure);
    if (f.arrival) dates.push(f.arrival);
  }
  const sorted = dates.filter(Boolean).sort();
  option.startDate = sorted[0]?.slice(0, 10) ?? null;
  option.endDate = sorted[sorted.length - 1]?.slice(0, 10) ?? null;
  if (!option.destination) {
    option.destination =
      option.hotels[0]?.city ??
      option.hotels[0]?.name?.match(/\(([^)]+)\)/)?.[1]?.split(",")[0]?.trim() ??
      option.flights[0]?.toIata ??
      null;
  }

  // total da opção = soma real dos produtos desta opção (a fonte não traz total por opção)
  const parts = [
    ...option.hotels.map((h) => h.total),
    ...option.flights.map((f) => f.total),
    ...([...option.cars, ...option.transfers, ...option.activities, ...option.tickets, ...option.insurance, ...option.services].map(
      (i) => i.total,
    )),
  ].filter((v): v is number => typeof v === "number");
  option.total = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  // Taxas da opção: a página da Infotravel mostra "Produtos + Taxas = Total".
  // As taxas ficam espalhadas nos `fares` de cada produto (não só do aéreo).
  option.taxes = somarTaxasDoPacote(pkg);
  option.currency = "BRL";
  option.notes = notes.size ? [...notes] : null;

  return { option, pax: { adults, children } };
}

// ---------------------------------------------------------------- entrada

export type InfotravelImport = {
  normalized: NormalizedQuote;
  raw: { bookingId: number; companyCode: string; optionsFound: number };
  partialErrors: string[];
};

/** Busca e normaliza o orçamento completo (todas as opções). Lança QuoteParseError. */
export async function importInfotravelQuote(url: string, html?: string): Promise<InfotravelImport> {
  const ref = resolveRef(url, html);
  log("Source fetched", ref.clientUrl.split("?")[0]);
  log("bookingId", ref.bookingId, "company", ref.companyCode);

  const booking = await trpc<any>(ref, "main.getBooking", {
    companyCode: ref.companyCode,
    bookingId: ref.bookingId,
    // sem o bookingIndex a Infotravel pode devolver outra versão da reserva
    // (produtos e valores diferentes dos exibidos na página)
    ...(ref.bookingIndex != null ? { bookingIndex: ref.bookingIndex } : {}),
    clientUrl: ref.clientUrl,
  });

  const packages: any[] = Array.isArray(booking?.bookingPackages) ? booking.bookingPackages : [];
  log("options found:", packages.length);
  if (!packages.length) throw new QuoteParseError("NO_OPTIONS_FOUND");

  const quote = emptyQuote("INFOTRAVEL");
  quote.sourceUrl = url;
  quote.sourceBookingId = String(ref.bookingId);
  quote.sourceBookingIndex = ref.bookingIndex != null ? String(ref.bookingIndex) : null;
  quote.sourceCompanyCode = ref.companyCode;
  quote.sourceId = String(ref.bookingId);

  const partialErrors: string[] = [];
  let adults = 0;
  let children = 0;

  packages.forEach((pkg, i) => {
    log(`option ${i + 1} parsing`);
    try {
      const { option, pax } = mapOption(pkg, i);
      if (!optionHasProducts(option)) {
        partialErrors.push(`Option ${i + 1} parse failed: NO_PRODUCTS_FOUND`);
        return;
      }
      adults = Math.max(adults, pax.adults);
      children = Math.max(children, pax.children);
      quote.options.push(option);
    } catch (e) {
      partialErrors.push(`Option ${i + 1} parse failed: ${(e as Error).message}`);
    }
  });

  if (!quote.options.length) throw new QuoteParseError("NO_PRODUCTS_FOUND", partialErrors.join(" | "));

  const first = quote.options[0]!;
  quote.hotels = first.hotels;
  quote.flights = first.flights;
  quote.cars = first.cars;
  quote.transfers = first.transfers;
  quote.activities = first.activities;
  quote.tickets = first.tickets;
  quote.insurance = first.insurance;
  quote.services = first.services;
  quote.startDate = first.startDate ?? null;
  quote.endDate = first.endDate ?? null;
  quote.destination = first.destination ?? null;
  quote.currency = booking?.bookingAmount?.currency ?? "BRL";

  // total: valor real da opção 1 (a página mostra o valor por opção).
  // Quando a reserva tem uma única opção, o bookingAmount da Infotravel é a
  // fonte oficial (produtos + taxas) e vence a soma dos produtos.
  const bookingTotal =
    typeof booking?.bookingAmount?.amount === "number" && booking.bookingAmount.amount > 0
      ? Math.round(booking.bookingAmount.amount * 100) / 100
      : null;
  if (packages.length === 1 && bookingTotal != null) {
    first.total = bookingTotal;
  }
  if (first.total == null) throw new QuoteParseError("TOTAL_NOT_FOUND", "nenhum valor encontrado na opção 1");
  quote.total = first.total;
  const taxasVoos = first.flights.reduce(
    (sum, flight) => sum + (typeof flight.taxes === "number" ? flight.taxes : 0),
    0,
  );
  const taxasOpcao =
    typeof first.taxes === "number" && first.taxes > 0
      ? first.taxes
      : taxasVoos > 0
        ? Math.round(taxasVoos * 100) / 100
        : null;
  quote.values = {
    subtotal: taxasOpcao != null && first.total != null ? Math.round((first.total - taxasOpcao) * 100) / 100 : first.total,
    taxes: taxasOpcao,
  };

  // Circuitos e grupos fechados podem omitir passageiros mesmo quando seus
  // produtos, voos e valores estão completos; não descarte esses pacotes.
  quote.passengers = { adults, children, infants: 0 };

  quote.client = {
    name: cleanText(booking?.contact?.name),
    phone: cleanText(booking?.contact?.telephone),
    email: cleanText(booking?.contact?.email),
  };
  quote.agent = cleanText(booking?.user?.name);
  quote.agency = cleanText(booking?.client?.name);
  quote.title = quote.destination ? `Orçamento ${quote.destination}` : `Orçamento ${ref.bookingId}`;

  const doc = cleanText(booking?.textDoc);
  if (doc) quote.notes = [doc];

  log("products found:", quote.options.map((o) => o.optionNumber).join(","));
  log("total:", quote.total);

  return {
    normalized: quote,
    raw: { bookingId: ref.bookingId, companyCode: ref.companyCode, optionsFound: packages.length },
    partialErrors,
  };
}

// ------------------------------------------------- importação resiliente

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Baixa o HTML da página do orçamento, aguardando a hidratação do Next (__NEXT_DATA__). */
export async function fetchInfotravelHtml(rawUrl: string, tentativas = 4, esperaMs = 2500): Promise<string | undefined> {
  const url = normalizarUrlOrcamento(rawUrl);
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        const html = await res.text();
        const next = readNextData(html);
        const pageProps = ((next?.props as any)?.pageProps ?? {}) as Record<string, unknown>;
        // só aceita quando a hidratação já traz a referência da reserva
        if (typeof pageProps["bookingId"] === "number") return html;
      }
    } catch {
      /* tenta de novo */
    }
    if (i < tentativas - 1) await sleep(esperaMs);
  }
  return undefined;
}

const opcaoVazia = (o: NormalizedOption) =>
  (!o.flights.length && !o.hotels.length) || !(typeof o.total === "number" && o.total > 0);

/**
 * Importa o orçamento esperando a página carregar (até ~10s) e repetindo
 * quando a Infotravel devolve opções sem voos/valores (payload ainda frio).
 */
export async function importInfotravelQuoteResilient(
  rawUrl: string,
  { tentativas = 3, esperaMs = 3500 }: { tentativas?: number; esperaMs?: number } = {},
): Promise<InfotravelImport> {
  const url = normalizarUrlOrcamento(rawUrl);
  const html = await fetchInfotravelHtml(url);
  let melhor: InfotravelImport | null = null;
  let ultimoErro: unknown = null;

  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await importInfotravelQuote(url, html);
      const opcoes = r.normalized.options ?? [];
      const vazias = opcoes.filter(opcaoVazia).length;
      const melhorVazias = melhor ? (melhor.normalized.options ?? []).filter(opcaoVazia).length : Infinity;
      const melhorOpcoes = melhor ? (melhor.normalized.options ?? []).length : -1;
      if (opcoes.length > melhorOpcoes || (opcoes.length === melhorOpcoes && vazias < melhorVazias)) melhor = r;
      if (opcoes.length && !vazias) return r;
    } catch (e) {
      ultimoErro = e;
    }
    if (i < tentativas - 1) await sleep(esperaMs);
  }

  if (melhor) return melhor;
  throw ultimoErro instanceof Error ? ultimoErro : new QuoteParseError("NO_OPTIONS_FOUND");
}
