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

async function taFetch(path: string, opts?: { language?: string }): Promise<Response> {
  const key = process.env.TRIPADVISOR_API_KEY;
  if (!key) throw new Error("TRIPADVISOR_API_KEY não configurada");
  const lang = opts?.language;
  let url = `${BASE}${path}`;
  if (lang) {
    url += (url.includes("?") ? "&" : "?") + `language=${encodeURIComponent(lang)}`;
  }
  return fetch(url, {
    headers: { accept: "application/json", "X-API-KEY": key },
  });
}

// Traduz um lote de textos para português usando Lovable AI. Se falhar, retorna os originais.
async function translateBatchToPt(texts: string[]): Promise<string[]> {
  const clean = texts.map((t) => (t || "").trim());
  if (clean.every((t) => !t)) return clean;
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return clean;
  try {
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    const numbered = clean.map((t, i) => `[${i}] ${t.replace(/\s+/g, " ")}`).join("\n---\n");
    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash-lite"),
      system:
        "Você é um tradutor. Traduza cada trecho para português do Brasil, preservando tom e conteúdo. Responda APENAS no mesmo formato: cada item começa com `[N]` (mesmo índice recebido) e itens separados por uma linha `---`. Não adicione comentários.",
      prompt: numbered,
    });
    const parts = text.split(/\n-{2,}\n/g);
    const out = [...clean];
    for (const p of parts) {
      const m = p.match(/^\s*\[(\d+)\]\s*([\s\S]*)$/);
      if (!m) continue;
      const idx = Number(m[1]);
      const val = m[2].trim();
      if (Number.isFinite(idx) && idx >= 0 && idx < out.length && val) {
        out[idx] = val;
      }
    }
    return out;
  } catch (err) {
    console.warn("[tripadvisor] translateBatchToPt failed:", (err as Error).message);
    return clean;
  }
}

function pickName(names: Array<{ language?: string; value?: string; primary?: boolean }> | undefined, lang = "pt"): string {
  if (!Array.isArray(names) || names.length === 0) return "";
  const byLang = names.find((n) => n.language === lang);
  if (byLang?.value) return byLang.value;
  const primary = names.find((n) => n.primary);
  if (primary?.value) return primary.value;
  return names[0]?.value ?? "";
}

function localizedText(value: unknown, lang = "pt"): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const localized = value.find((item) => {
      if (!item || typeof item !== "object") return false;
      const language = String((item as Record<string, unknown>).language ?? "").toLowerCase();
      return language === lang || language.startsWith(`${lang}-`);
    });
    const primary = value.find(
      (item) => item && typeof item === "object" && (item as Record<string, unknown>).primary === true,
    );
    return localizedText(localized ?? primary ?? value[0], lang);
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const candidate of [
    record.value,
    record.localized_name,
    record.display_name,
    record.name,
    record.text,
    record.description,
    record.title,
  ]) {
    const text = localizedText(candidate, lang);
    if (text) return text;
  }
  return "";
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
  const tr = (obj as { traveler_ratings?: { overall?: { rating?: unknown } } }).traveler_ratings;
  const candidates: unknown[] = [
    tr?.overall?.rating,
    (obj.overall_rating as { rating?: unknown } | undefined)?.rating,
    obj.overall_rating,
    obj.rating,
    (obj as { review_rating?: { rating?: unknown } }).review_rating?.rating,
    (obj as { ratings?: { overall?: { rating?: unknown } } }).ratings?.overall?.rating,
    (obj as { review_summary?: { rating?: unknown } }).review_summary?.rating,
    (obj as { data?: { rating?: unknown; overall_rating?: unknown } }).data?.rating,
    (obj as { data?: { rating?: unknown; overall_rating?: unknown } }).data?.overall_rating,
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
      // 429 (rate limit) e 5xx: não quebra o fluxo do chamador — devolve
      // um objeto vazio pra IA/UI seguirem sem enriquecimento do TripAdvisor.
      if (rDet.status === 429 || rDet.status >= 500) {
        return {
          location_id: id,
          name: "", address: null, city: null, country: null,
          latitude: null, longitude: null, rating: null,
          tripadvisor_url: null, phone: null, website: null,
          photos: [], description: null, hotel_class: null,
        };

      }
      throw new Error(`TripAdvisor details ${rDet.status}: ${body.slice(0, 200)}`);
    }

    const rawDet = (await rDet.json()) as Record<string, unknown>;
    // Algumas versões da API envolvem os detalhes em `data` ou `location`.
    const det = ((rawDet.data as Record<string, unknown> | undefined)
      ?? (rawDet.location as Record<string, unknown> | undefined)
      ?? rawDet);
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
      description: localizedText(det.description) || null,
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

// ============================================================================
// Público (sem auth) — usado no site do cliente pra abrir modal do hotel
// com todas as fotos, avaliações, ranking, amenidades. NUNCA retorna preços.
// ============================================================================

export type TAPublicReview = {
  id: number;
  rating: number | null;
  title: string | null;
  text: string | null;
  published_date: string | null;
  user_name: string | null;
  user_location: string | null;
  trip_type: string | null;
  /** Idioma de origem antes da tradução (ex.: "en"). null se já veio em pt. */
  translated_from: string | null;
};

export type TAPublicHotelInfo = {
  location_id: number;
  name: string;
  description: string | null;
  description_translated_from: string | null;
  address: string | null;
  rating: number | null;
  num_reviews: number | null;
  ranking: string | null;
  hotel_class: number | null;
  price_level: null; // sempre null — não expomos preços
  amenities: string[];
  awards: Array<{ name: string; year: string | null }>;
  photos: string[];
  reviews: TAPublicReview[];
  tripadvisor_url: string | null;
  rating_histogram: Record<string, number> | null;
  subratings: Array<{ name: string; value: number }>;
};

export const getTripAdvisorPublicHotelInfo = createServerFn({ method: "POST" })
  .inputValidator((input: { locationId: number }) => input)
  .handler(async ({ data }): Promise<TAPublicHotelInfo> => {
    const id = data.locationId;
    // Terra API costuma capar `limit` das fotos em ~5-30 por chamada; paginamos com offset
    // pra montar uma galeria robusta (~150 fotos).
    const PHOTO_PAGES = 6;
    const PHOTO_PAGE_SIZE = 30;
    const photoRequests = Array.from({ length: PHOTO_PAGES }, (_, i) =>
      taFetch(`/locations/${id}/photos?limit=${PHOTO_PAGE_SIZE}&offset=${i * PHOTO_PAGE_SIZE}`, { language: "pt" }),
    );
    const [rDet, rReviews, ...rPhotoPages] = await Promise.all([
      taFetch(`/locations/${id}`, { language: "pt" }),
      taFetch(`/locations/${id}/reviews?limit=20`, { language: "pt" }),
      ...photoRequests,
    ]);

    const empty: TAPublicHotelInfo = {
      location_id: id, name: "", description: null, description_translated_from: null,
      address: null, rating: null, num_reviews: null, ranking: null, hotel_class: null,
      price_level: null, amenities: [], awards: [], photos: [], reviews: [],
      tripadvisor_url: null, rating_histogram: null, subratings: [],
    };

    if (!rDet.ok) return empty;

    const rawDet = (await rDet.json()) as Record<string, unknown>;
    const det = ((rawDet.data as Record<string, unknown> | undefined)
      ?? (rawDet.location as Record<string, unknown> | undefined)
      ?? rawDet);

    const addr = pickAddress(det.addresses as Array<Record<string, unknown>> | undefined);
    const rating = extractRating(det);
    const url = (det.urls as { tripadvisor?: { main?: string } } | undefined)?.tripadvisor?.main ?? null;
    const tr = (det as { traveler_ratings?: {
      overall?: { rating?: number; count?: number };
      breakdowns?: Array<{ count?: number; rating?: number }>;
    } }).traveler_ratings;

    // Amenidades/awards/subratings/hotel_class não vêm nesta API — mantemos vazios.
    const amenities: string[] = [];
    const awards: Array<{ name: string; year: string | null }> = [];
    const subratings: Array<{ name: string; value: number }> = [];

    const numReviews = (() => {
      const n = tr?.overall?.count
        ?? (det as { num_reviews?: unknown }).num_reviews
        ?? (det as { review_count?: unknown }).review_count;
      const v = typeof n === "number" ? n : Number(n);
      return Number.isFinite(v) ? v : null;
    })();

    const ranking = (() => {
      const rd = (det as { ranking_data?: Record<string, unknown> }).ranking_data;
      if (rd) {
        const value = localizedText(rd.ranking_string);
        if (value) return value;
      }
      return localizedText((det as { ranking?: unknown }).ranking) || null;
    })();

    let hotelClass = extractHotelClass(det);
    if (hotelClass == null && url) {
      hotelClass = await scrapeHotelClassFromPage(url).catch(() => null);
    }

    const histogram = (() => {
      if (Array.isArray(tr?.breakdowns) && tr.breakdowns.length > 0) {
        const out: Record<string, number> = {};
        for (const b of tr.breakdowns) {
          const k = String(b.rating ?? "");
          const v = Number(b.count);
          if (["1","2","3","4","5"].includes(k) && Number.isFinite(v)) out[k] = v;
        }
        if (Object.keys(out).length) return out;
      }
      const rh = (det as { review_rating_count?: Record<string, unknown> }).review_rating_count;
      if (!rh || typeof rh !== "object") return null;
      const out: Record<string, number> = {};
      for (const k of ["1", "2", "3", "4", "5"]) {
        const v = Number((rh as Record<string, unknown>)[k]);
        if (Number.isFinite(v)) out[k] = v;
      }
      return Object.keys(out).length ? out : null;
    })();


    let photos: string[] = [];
    if (rPhotos.ok) {
      const jp = (await rPhotos.json()) as { data?: Array<{ photo?: { original_size_url?: string; large_size_url?: string } }> };
      photos = (jp.data || [])
        .map((p) => p.photo?.original_size_url ?? p.photo?.large_size_url)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
    }

    // ---------- Descrição ----------
    // Terra API expõe `descriptions: [{language, value}]`; preferimos pt, senão o primary/en.
    const rawDescription: string | null = (() => {
      const arr = (det as { descriptions?: Array<{ language?: string; value?: string; primary?: boolean }> }).descriptions;
      if (Array.isArray(arr) && arr.length > 0) {
        const pt = arr.find((d) => d?.language?.toLowerCase().startsWith("pt"))?.value;
        if (pt) return pt;
        const primary = arr.find((d) => d?.primary)?.value;
        if (primary) return primary;
        return arr[0]?.value || null;
      }
      return localizedText(det.description) || null;
    })();
    const descriptionLang: string | null = (() => {
      const arr = (det as { descriptions?: Array<{ language?: string; value?: string; primary?: boolean }> }).descriptions;
      if (Array.isArray(arr)) {
        const pt = arr.find((d) => d?.language?.toLowerCase().startsWith("pt"));
        if (pt) return "pt";
        const primary = arr.find((d) => d?.primary);
        if (primary?.language) return primary.language.toLowerCase().slice(0, 2);
        if (arr[0]?.language) return arr[0].language.toLowerCase().slice(0, 2);
      }
      if (!rawDescription) return null;
      if (/[ãõçáéíóúâêôà]/i.test(rawDescription)) return "pt";
      return "en";
    })();

    let description = rawDescription;
    let descriptionTranslatedFrom: string | null = null;
    const toTranslate: string[] = [];
    const translateSlots: Array<{ kind: "desc" } | { kind: "review"; index: number; field: "title" | "text" }> = [];
    if (description && descriptionLang && descriptionLang !== "pt") {
      translateSlots.push({ kind: "desc" });
      toTranslate.push(description);
      descriptionTranslatedFrom = descriptionLang;
    }

    // ---------- Reviews ----------
    type RawReview = {
      id: number; rating: number | null; title: string | null; text: string | null;
      published_date: string | null; user_name: string | null; user_location: string | null;
      trip_type: string | null; lang: string;
    };
    const raw: RawReview[] = [];
    if (rReviews.ok) {
      const jr = (await rReviews.json()) as { data?: Array<Record<string, unknown>> };
      for (const r of (jr.data || []).slice(0, 20)) {
        const user = (r.user as { username?: string; user_location?: { name?: string } } | undefined);
        const title = localizedText(r.title) || null;
        const text = localizedText(r.text) || null;
        let lang = String((r as { lang?: string }).lang || "").toLowerCase().slice(0, 2);
        if (!lang) {
          const sample = `${title ?? ""} ${text ?? ""}`;
          lang = /[ãõçáéíóúâêôà]/i.test(sample) ? "pt" : "en";
        }
        raw.push({
          id: Number(r.id) || 0,
          rating: (() => { const n = Number(r.rating); return Number.isFinite(n) ? n : null; })(),
          title, text,
          published_date: (r.published_date as string) || null,
          user_name: user?.username ?? null,
          user_location: localizedText(user?.user_location?.name) || null,
          trip_type: localizedText(r.trip_type) || null,
          lang,
        });
      }
    }
    raw.forEach((r, idx) => {
      if (r.lang !== "pt") {
        if (r.title) { translateSlots.push({ kind: "review", index: idx, field: "title" }); toTranslate.push(r.title); }
        if (r.text)  { translateSlots.push({ kind: "review", index: idx, field: "text"  }); toTranslate.push(r.text); }
      }
    });

    if (toTranslate.length > 0) {
      const translated = await translateBatchToPt(toTranslate);
      translated.forEach((val, i) => {
        const slot = translateSlots[i];
        if (!slot) return;
        if (slot.kind === "desc") description = val;
        else raw[slot.index][slot.field] = val;
      });
    }

    const reviews: TAPublicReview[] = raw
      .filter((r) => (r.rating ?? 0) >= 4)
      .sort((a, b) => {
        const rd = (b.rating ?? 0) - (a.rating ?? 0);
        if (rd !== 0) return rd;
        const ad = a.published_date ? new Date(a.published_date).getTime() : 0;
        const bd = b.published_date ? new Date(b.published_date).getTime() : 0;
        return bd - ad;
      })
      .map((r) => ({
        id: r.id, rating: r.rating, title: r.title, text: r.text,
        published_date: r.published_date, user_name: r.user_name,
        user_location: r.user_location, trip_type: r.trip_type,
        translated_from: r.lang !== "pt" ? r.lang : null,
      }));

    return {
      location_id: id,
      name: pickName(det.names as Array<{ language?: string; value?: string; primary?: boolean }>),
      description,
      description_translated_from: descriptionTranslatedFrom,
      address: addr?.formatted ?? null,
      rating,
      num_reviews: numReviews,
      ranking,
      hotel_class: hotelClass,
      price_level: null,
      amenities,
      awards,
      photos,
      reviews,
      tripadvisor_url: url,
      rating_histogram: histogram,
      subratings,
    };
  });

