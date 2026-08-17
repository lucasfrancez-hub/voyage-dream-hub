/**
 * Jornada combinada (Aéreo + Hotel) da operadora.
 *
 * A operadora trata Aéreo + Hotel como UMA jornada só: as duas pesquisas
 * compartilham a mesma `searchKey` de jornada e as páginas de contexto ficam
 * em /viaair/combined/flight e /viaair/combined/hotel. O carrinho final é
 * único: /viaair/combined/cart?cartId=...&source=p
 *
 * Este módulo é puro (client-safe) e só monta as URLs de contexto.
 */

const BASE = "https://www.comprarviagem.com.br/viaair";

/** Chave de jornada no mesmo formato da operadora (24 hex). */
export function newCombinedKey(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const iso = (date: string) => (date.includes("T") ? date : `${date}T00:00:00Z`);

export type CombinedStation = { departureStation: string; arrivalStation: string };

/** /viaair/combined/flight — contexto da pesquisa de voo dentro da jornada. */
export function combinedFlightHref(p: {
  combinedKey: string;
  departureDate: string;
  returnDate?: string | null;
  stations: CombinedStation[];
  adults: number;
  children?: number;
  infants?: number;
  isPackage?: boolean;
}): string {
  const q = new URLSearchParams({
    departureDate: iso(p.departureDate),
    adultsCount: String(p.adults),
    childCount: String(p.children ?? 0),
    infantCount: String(p.infants ?? 0),
    teenagerCount: "0",
    isRoundTrip: String(!!p.returnDate),
    isPackage: String(p.isPackage ?? false),
    source: "f",
    searchKey: p.combinedKey,
  });
  if (p.returnDate) q.set("returnDate", iso(p.returnDate));
  q.set("stations", encodeURIComponent(JSON.stringify(p.stations)));
  return `${BASE}/combined/flight?${q.toString()}`;
}

/** /viaair/combined/hotel — contexto da pesquisa de hotel dentro da jornada. */
export function combinedHotelHref(p: {
  combinedKey: string;
  pointId: string;
  pointType: number;
  checkIn: string;
  checkOut: string;
  rooms: Array<{ numberOfAdults: number; numberOfChilds: number; agesOfChild: number[] }>;
  isPackage?: boolean;
}): string {
  const q = new URLSearchParams({
    type: String(p.pointType),
    id: p.pointId,
    startDate: iso(p.checkIn),
    endDate: iso(p.checkOut),
    isPackage: String(p.isPackage ?? false),
    source: "h",
    searchKey: p.combinedKey,
  });
  q.set("rooms", encodeURIComponent(JSON.stringify(p.rooms)));
  return `${BASE}/combined/hotel?${q.toString()}`;
}

/** Carrinho único da jornada combinada. */
export function combinedCartUrl(cartId: string): string {
  return `${BASE}/combined/cart?cartId=${cartId}&source=p`;
}
