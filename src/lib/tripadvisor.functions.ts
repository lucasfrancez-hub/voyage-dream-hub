import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://terra.tripadvisor.com/api";

export type TAHotelSuggestion = {
  location_id: number;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  tripadvisor_url: string | null;
};

export type TAHotelDetails = TAHotelSuggestion & {
  phone: string | null;
  website: string | null;
  photos: string[];
  description: string | null;
  /** Classificação oficial do hotel (1..5 estrelas). */
  hotel_class: number | null;
};

async function taFetch(path: string): Promise<Response> {
  const key = process.env.TRIPADVISOR_API_KEY;
  if (!key) throw new Error("TRIPADVISOR_API_KEY não configurada");
  return fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", "X-API-KEY": key },
  });
}

function pickName(names: Array<{ language?: string; value?: string; primary?: boolean }> | undefined, lang = "pt"): string {
  if (!Array.isArray(names) || names.length === 0) return "";
  const byLang = names.find((n) => n.language === lang);
  if (byLang?.value) return byLang.value;
  const primary = names.find((n) => n.primary);
  if (primary?.value) return primary.value;
  return names[0]?.value ?? "";
}

function pickAddress(addresses: Array<Record<string, unknown>> | undefined) {
  if (!Array.isArray(addresses) || addresses.length === 0) return null;
  const a = addresses[0] as Record<string, string>;
  return {
    formatted: (a.formatted as string) || null,
    street: (a.street_address as string) || null,
    city: (a.city as string) || null,
    country: (a.country_name as string) || null,
  };
}

function extractRating(obj: Record<string, unknown>): number | null {
  const candidates: unknown[] = [
    (obj.overall_rating as { rating?: unknown } | undefined)?.rating,
    obj.rating,
    (obj as { review_rating?: { rating?: unknown } }).review_rating?.rating,
    (obj as { ratings?: { overall?: { rating?: unknown } } }).ratings?.overall?.rating,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const n = typeof c === "number" ? c : Number(String(c).replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n <= 5) return n;
  }
  return null;
}


// Busca hotéis por nome (autocomplete). Retorna até 8 sugestões.
export const searchTripAdvisorHotels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<TAHotelSuggestion[]> => {
    const q = (data.query || "").trim();
    if (q.length < 3) return [];
    const url = `/catalog/locations/search?query=${encodeURIComponent(q)}&search_type=NAME&category=HOTEL`;
    const r = await taFetch(url);
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error("[tripadvisor] search failed", r.status, body);
      // fall back: sem filtro de categoria
      const r2 = await taFetch(`/catalog/locations/search?query=${encodeURIComponent(q)}`);
      if (!r2.ok) return [];
      const j2 = (await r2.json()) as { data?: Array<{ location?: Record<string, unknown> }> };
      return mapSearch(j2.data || []);
    }
    const j = (await r.json()) as { data?: Array<{ location?: Record<string, unknown> }> };
    return mapSearch(j.data || []);
  });

function mapSearch(list: Array<{ location?: Record<string, unknown> }>): TAHotelSuggestion[] {
  return list.slice(0, 8).map((item) => {
    const loc = (item.location ?? item) as Record<string, unknown>;
    const addr = pickAddress(loc.addresses as Array<Record<string, unknown>> | undefined);
    const coords = (loc.coordinates as { latitude?: number; longitude?: number } | undefined) || undefined;
    const rating = extractRating(loc);

    const url = (loc.urls as { tripadvisor?: { main?: string } } | undefined)?.tripadvisor?.main ?? null;
    return {
      location_id: Number(loc.id),
      name: pickName(loc.names as Array<{ language?: string; value?: string; primary?: boolean }>),
      address: addr?.formatted ?? null,
      city: addr?.city ?? null,
      country: addr?.country ?? null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      rating,
      tripadvisor_url: url,
    };
  });
}

// Busca detalhes + fotos de um hotel específico.
export const getTripAdvisorHotelDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locationId: number; photoLimit?: number }) => input)
  .handler(async ({ data }): Promise<TAHotelDetails> => {
    const id = data.locationId;
    const limit = Math.min(Math.max(data.photoLimit ?? 5, 1), 10);
    const [rDet, rPhotos] = await Promise.all([
      taFetch(`/locations/${id}`),
      taFetch(`/locations/${id}/photos?limit=${limit}`),
    ]);
    if (!rDet.ok) {
      const body = await rDet.text().catch(() => "");
      throw new Error(`TripAdvisor details ${rDet.status}: ${body.slice(0, 200)}`);
    }
    const det = (await rDet.json()) as Record<string, unknown>;
    const addr = pickAddress(det.addresses as Array<Record<string, unknown>> | undefined);
    const coords = (det.coordinates as { latitude?: number; longitude?: number } | undefined) || undefined;
    const rating = extractRating(det);
    const url = (det.urls as { tripadvisor?: { main?: string } } | undefined)?.tripadvisor?.main ?? null;
    const phones = det.phone_numbers as Array<{ value?: string }> | undefined;
    const websites = det.websites as Array<{ url?: string }> | undefined;

    // Classificação oficial (1..5). TripAdvisor expõe em campos variados:
    // hotel_class ("4.0"), class, awards[].display_name ("4-star hotel"),
    // ranking_data.hotel_class, etc. Tentamos todos, e caímos em scraping
    // da página pública como último recurso (JSON-LD starRating).
    let hotelClass = extractHotelClass(det);
    if (hotelClass == null && url) {
      hotelClass = await scrapeHotelClassFromPage(url).catch(() => null);
    }

    let photos: string[] = [];
    if (rPhotos.ok) {
      const jp = (await rPhotos.json()) as { data?: Array<{ photo?: { original_size_url?: string } }> };
      photos = (jp.data || [])
        .map((p) => p.photo?.original_size_url)
        .filter((u): u is string => typeof u === "string" && u.length > 0)
        .slice(0, limit);
    }

    return {
      location_id: id,
      name: pickName(det.names as Array<{ language?: string; value?: string; primary?: boolean }>),
      address: addr?.formatted ?? null,
      city: addr?.city ?? null,
      country: addr?.country ?? null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      rating,
      tripadvisor_url: url,
      phone: phones?.[0]?.value ?? null,
      website: websites?.[0]?.url ?? null,
      photos,
      description: (det.description as string | undefined) ?? null,
      hotel_class: hotelClass,
    };

  });

function extractHotelClass(det: Record<string, unknown>): number | null {
  const candidates: unknown[] = [
    det.hotel_class,
    det.class,
    (det.ranking_data as { hotel_class?: unknown } | undefined)?.hotel_class,
  ];
  const awards = det.awards as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(awards)) {
    for (const a of awards) {
      candidates.push(a.display_name, a.name, a.award_type);
    }
  }
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c);
    // Aceita "4", "4.0", "4-star hotel", "Categoria 4 estrelas"
    const m = s.match(/([1-5])(?:\.\d)?/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 5) return n;
    }
  }
  return null;
}

async function scrapeHotelClassFromPage(url: string): Promise<number | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  // JSON-LD schema.org/Hotel starRating.ratingValue
  const ld = html.match(/"starRating"\s*:\s*\{[^}]*"ratingValue"\s*:\s*"?([1-5](?:\.\d)?)/i);
  if (ld) {
    const n = Math.round(Number(ld[1]));
    if (n >= 1 && n <= 5) return n;
  }
  // Embedded fields TA usa em variantes: "hotelClass":4, hotel_class":"4.0"
  const emb = html.match(/hotel[_ ]?class"?\s*:\s*"?([1-5](?:\.\d)?)/i);
  if (emb) {
    const n = Math.round(Number(emb[1]));
    if (n >= 1 && n <= 5) return n;
  }
  // Texto exibido: "4-star hotel" / "Hotel 4 estrelas"
  const txt = html.match(/([1-5])[-\s]?(?:star|estrelas?)/i);
  if (txt) {
    const n = Number(txt[1]);
    if (n >= 1 && n <= 5) return n;
  }
  return null;
}

