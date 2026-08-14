/**
 * Normalização Expedia TAAP -> contrato interno VIA AIR.
 *
 * Funções puras (sem rede / sem navegador) para poderem ser testadas.
 * Regra de ouro: campo ausente vira `null`. Nunca inventar informação.
 */
import type { HotelResult, HotelSearchQuery } from "@/lib/hotels/types";

/**
 * Domínio TAAP da agência — é o ÚNICO que devolve tarifa TAAP.
 * Nunca apontar para www.expedia.com.br.
 */
export const EXPEDIA_BASE = "https://www.expediataap.com.br";

/** Adultos por quarto no formato aceito pelo TAAP: "2" ou "2,2". */
function adultsParam(rooms: number, adults: number) {
  return Array.from({ length: rooms }, () => String(adults)).join(",");
}

/**
 * Pesquisa de hospedagem standalone (/Hotel-Search).
 * Nada é fixo: destino, datas, hóspedes, regionId e coordenadas vêm sempre
 * da consulta. `regionId`/`latLong` só entram quando conhecidos.
 */
export function buildHotelSearchUrl(q: HotelSearchQuery): string {
  const rooms = Math.max(1, q.rooms ?? 1);
  const adults = Math.max(1, q.adults ?? 2);
  const url = new URL(`${EXPEDIA_BASE}/Hotel-Search`);
  const p = url.searchParams;
  p.set("destination", q.destination);
  p.set("startDate", q.startDate);
  p.set("endDate", q.endDate);
  p.set("d1", q.startDate);
  p.set("d2", q.endDate);
  p.set("rooms", String(rooms));
  p.set("adults", adultsParam(rooms, adults));
  if (q.regionId) p.set("regionId", q.regionId);
  if (q.latLong) p.set("latLong", q.latLong);
  p.set("useRewards", "false");
  p.set("rate_type", "standalone");
  p.set("sort", "RECOMMENDED");
  return url.toString();
}

/**
 * Pesquisa de pacote voo + hotel (packageType=fh).
 *
 * O `misId` observado nas URLs reais é gerado internamente pela Expedia e
 * pode estar atrelado à sessão/pesquisa — NUNCA o fabricamos. Quando não
 * temos um `misId` capturado da própria interface autenticada, a URL é
 * montada apenas com os parâmetros públicos do fluxo e o robô refaz a
 * pesquisa pela interface.
 */
export function buildPackageSearchUrl(q: HotelSearchQuery): string {
  const rooms = Math.max(1, q.rooms ?? 1);
  const adults = Math.max(1, q.adults ?? 2);
  const url = new URL(`${EXPEDIA_BASE}/Hotel-Search`);
  const p = url.searchParams;
  if (q.misId) p.set("misId", q.misId);
  p.set("packageType", "fh");
  p.set("searchProduct", "hotel");
  p.set("adults", adultsParam(rooms, adults));
  p.set("sort", "RECOMMENDED");
  p.set("tripType", q.tripType ?? "ROUND_TRIP");
  p.set("cabinClass", q.cabinClass ?? "COACH");
  p.set("startDate", q.startDate);
  p.set("endDate", q.endDate);
  if (q.regionId) p.set("regionId", q.regionId);
  p.set("destination", q.destination);
  if (q.origin) p.set("origin", q.origin);
  p.set("useRewards", "false");
  p.set("directFlights", q.directFlights ? "true" : "false");
  p.set("infantsInSeats", String(q.infantsInSeats ?? 0));
  p.set("partialStay", "false");
  return url.toString();
}

/**
 * Página da propriedade dentro da MESMA sessão da pesquisa.
 * Preferimos sempre o `detail_url` devolvido pela própria listagem; este
 * builder é o plano B, montado só com parâmetros observados no fluxo real.
 */
export function buildPropertyDetailUrl(input: {
  propertyId: string;
  detailUrl?: string | null;
  startDate: string;
  endDate: string;
  rooms?: number;
  adults?: number;
  regionId?: string | null;
  latLong?: string | null;
  destination?: string | null;
  searchId?: string | null;
}): string {
  const rooms = Math.max(1, input.rooms ?? 1);
  const adults = Math.max(1, input.adults ?? 2);
  const url = new URL(
    input.detailUrl && input.detailUrl.startsWith("http")
      ? input.detailUrl
      : `${EXPEDIA_BASE}/h${input.propertyId}.Hotel-Reservas`,
  );
  const p = url.searchParams;
  p.set("chkin", input.startDate);
  p.set("chkout", input.endDate);
  for (let i = 1; i <= rooms; i++) p.set(`rm${i}`, `a${adults}`);
  if (input.regionId) p.set("regionId", input.regionId);
  if (input.destination) p.set("destination", input.destination);
  if (input.latLong) p.set("latLong", input.latLong);
  if (input.searchId) p.set("searchId", input.searchId);
  p.set("useRewards", "false");
  p.set("sort", "RECOMMENDED");
  return url.toString();
}


/** "R$ 1.234,56" | "1,234.56" | 1234.56 -> 1234.56 */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else normalized = cleaned.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function detectCurrency(text: unknown): string | null {
  if (typeof text !== "string") return null;
  if (/R\$/.test(text)) return "BRL";
  if (/US\$|\bUSD\b/.test(text)) return "USD";
  if (/€|\bEUR\b/.test(text)) return "EUR";
  return null;
}

function absoluteUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http")) return value;
  if (value.startsWith("/")) return `${EXPEDIA_BASE}${value}`;
  return null;
}

function firstNumber(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const m = text.replace(/\./g, "").match(/(\d+(?:,\d+)?)/);
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** Varre recursivamente um JSON procurando listas de propriedades da Expedia. */
export function findPropertyNodes(payload: unknown, depth = 0): Json[] {
  if (depth > 8 || !payload) return [];
  if (Array.isArray(payload)) return payload.flatMap((item) => findPropertyNodes(item, depth + 1));
  if (!isObj(payload)) return [];

  const looksLikeProperty =
    typeof payload.id === "string" &&
    typeof payload.name === "string" &&
    ("price" in payload || "propertyImage" in payload || "destinationInfo" in payload || "reviews" in payload);
  if (looksLikeProperty) return [payload];

  return Object.values(payload).flatMap((value) => findPropertyNodes(value, depth + 1));
}

/** Nível 1/2 — normaliza um nó de propriedade vindo do JSON da Expedia. */
export function normalizePropertyNode(node: Json, searchId: string | null): HotelResult | null {
  const name = typeof node.name === "string" ? node.name.trim() : "";
  if (!name) return null;
  const id = typeof node.id === "string" ? node.id : null;

  const price = isObj(node.price) ? node.price : {};
  const options = Array.isArray((price as Json).options) ? ((price as Json).options as Json[]) : [];
  const lead = isObj((price as Json).lead) ? ((price as Json).lead as Json) : null;
  const displayMessages = Array.isArray((price as Json).displayMessages)
    ? ((price as Json).displayMessages as unknown[])
    : [];

  const priceTexts: string[] = [];
  const collectText = (value: unknown, d = 0) => {
    if (d > 6) return;
    if (typeof value === "string") priceTexts.push(value);
    else if (Array.isArray(value)) value.forEach((v) => collectText(v, d + 1));
    else if (isObj(value)) Object.values(value).forEach((v) => collectText(v, d + 1));
  };
  collectText(displayMessages);

  const nightly =
    (lead && parseMoney(lead.amount ?? lead.formatted)) ??
    parseMoney(priceTexts.find((t) => /R\$|\bUS\$/.test(t))) ??
    null;

  const totalNode = options
    .map((o) => (isObj(o.formattedDisplayPrice) ? o.formattedDisplayPrice : o.formattedDisplayPrice))
    .find((v) => typeof v === "string") as string | undefined;
  const total = parseMoney(totalNode) ?? nightly;

  const currency =
    (lead && typeof lead.currency === "string" ? lead.currency : null) ??
    detectCurrency(priceTexts.join(" ")) ??
    (totalNode ? detectCurrency(totalNode) : null);

  const reviews = isObj(node.reviews) ? node.reviews : {};
  const image =
    absoluteUrl(
      isObj(node.propertyImage) && isObj((node.propertyImage as Json).image)
        ? ((node.propertyImage as Json).image as Json).url
        : undefined,
    ) ?? absoluteUrl(isObj(node.image) ? (node.image as Json).url : undefined);

  const destinationInfo = isObj(node.destinationInfo) ? node.destinationInfo : {};
  const neighborhood = isObj(node.neighborhood) ? node.neighborhood : {};

  return {
    source: "EXPEDIA_TAAP",
    search_id: searchId,
    property_id: id,
    name,
    destination:
      (typeof destinationInfo.regionName === "string" ? destinationInfo.regionName : null) ??
      (typeof neighborhood.name === "string" ? neighborhood.name : null),
    image,
    rating: typeof node.star === "number" ? node.star : parseMoney(node.starRating) ?? null,
    review_score: typeof reviews.score === "number" ? reviews.score : null,
    review_count: typeof reviews.total === "number" ? reviews.total : null,
    price: { currency, nightly, total },
    detail_url: absoluteUrl(
      isObj(node.cardLink) && isObj((node.cardLink as Json).resource)
        ? ((node.cardLink as Json).resource as Json).value
        : undefined,
    ),
    available: node.availability === undefined ? true : !!node.availability,
  };
}

/** Estrutura crua colhida do DOM (nível 3). */
export type DomCard = {
  propertyId: string | null;
  name: string | null;
  image: string | null;
  href: string | null;
  priceText: string | null;
  totalText: string | null;
  reviewText: string | null;
  starText: string | null;
  locationText: string | null;
  soldOut: boolean;
};

/** Nível 3 — normaliza cards renderizados. */
export function normalizeDomCard(card: DomCard, searchId: string | null): HotelResult | null {
  const name = card.name?.trim();
  if (!name) return null;
  const nightly = parseMoney(card.priceText);
  const total = parseMoney(card.totalText) ?? nightly;
  return {
    source: "EXPEDIA_TAAP",
    search_id: searchId,
    property_id: card.propertyId,
    name,
    destination: card.locationText?.trim() || null,
    image: absoluteUrl(card.image),
    rating: firstNumber(card.starText),
    review_score: firstNumber(card.reviewText),
    review_count: card.reviewText ? firstNumber((card.reviewText.match(/\((.*?)\)/) || [])[1] ?? null) : null,
    price: {
      currency: detectCurrency(card.priceText ?? card.totalText),
      nightly,
      total,
    },
    detail_url: absoluteUrl(card.href),
    available: !card.soldOut,
  };
}

/** Remove duplicados mantendo o registro mais completo. */
export function dedupeResults(results: HotelResult[]): HotelResult[] {
  const map = new Map<string, HotelResult>();
  for (const item of results) {
    const key = item.property_id ?? item.name.toLowerCase();
    const current = map.get(key);
    if (!current) {
      map.set(key, item);
      continue;
    }
    const score = (h: HotelResult) =>
      [h.image, h.price.nightly, h.price.total, h.review_score, h.detail_url].filter((v) => v !== null).length;
    if (score(item) > score(current)) map.set(key, item);
  }
  return [...map.values()];
}
