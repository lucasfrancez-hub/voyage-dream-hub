/**
 * Camada única de busca de hospedagem consumida pelo portal.
 * Hoje resolve pelo robô TAAP; amanhã basta trocar o provedor aqui.
 */
import { expediaTaapProvider } from "@/lib/expedia/taap-provider.server";
import type { HotelSearchProvider, HotelSearchQuery, HotelSearchResponse } from "@/lib/hotels/types";

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; value: HotelSearchResponse };
const g = globalThis as unknown as {
  __viaHotelSearchCache?: Map<string, CacheEntry>;
  __viaHotelSearchInflight?: Map<string, Promise<HotelSearchResponse>>;
};
if (!g.__viaHotelSearchCache) g.__viaHotelSearchCache = new Map();
if (!g.__viaHotelSearchInflight) g.__viaHotelSearchInflight = new Map();

function cacheKey(q: HotelSearchQuery) {
  return [
    q.type ?? "HOTEL_STANDALONE",
    q.destination.trim().toLowerCase(),
    q.startDate,
    q.endDate,
    q.rooms ?? 1,
    q.adults ?? 2,
    q.children ?? 0,
  ].join("|");
}

export function getHotelProvider(): HotelSearchProvider {
  return expediaTaapProvider;
}

export async function searchHotels(query: HotelSearchQuery): Promise<HotelSearchResponse> {
  const key = cacheKey(query);
  const cache = g.__viaHotelSearchCache!;
  const inflight = g.__viaHotelSearchInflight!;

  if (!query.refresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };
    const running = inflight.get(key);
    if (running) return running;
  }

  const promise = getHotelProvider()
    .search(query)
    .then((res) => {
      if (res.status === "SUCCESS") cache.set(key, { at: Date.now(), value: res });
      return res;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}
