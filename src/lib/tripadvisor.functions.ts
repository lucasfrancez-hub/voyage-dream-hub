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

/**
 * Controle de limite (HTTP 429) da chave do TripAdvisor. Ao estourar,
 * pausamos as chamadas por alguns minutos — insistir só queima mais cota.
 */
let taBloqueadoAte = 0;
function taLimitado() {
  return Date.now() < taBloqueadoAte;
}

async function taFetch(path: string, params?: Record<string, string>): Promise<Response> {
  const key = process.env.TRIPADVISOR_API_KEY;
  if (!key) throw new Error("TRIPADVISOR_API_KEY não configurada");
  const url = new URL(`${BASE}${path}`);
  Object.entries(params ?? {}).forEach(([name, value]) => url.searchParams.set(name, value));
  const res = await fetch(url.toString(), {
    headers: { accept: "application/json", "X-API-KEY": key },
  });
  if (res.status === 429) taBloqueadoAte = Date.now() + 10 * 60_000;
  return res;
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
    const out = [...clean];

    // Reviews longos podem fazer o modelo omitir o primeiro item quando todos
    // são enviados juntos. Divida em lotes pequenos, preservando os índices.
    const groups: Array<Array<{ index: number; value: string }>> = [];
    let group: Array<{ index: number; value: string }> = [];
    let chars = 0;
    clean.forEach((value, index) => {
      if (!value) return;
      if (group.length && (group.length >= 3 || chars + value.length > 4_500)) {
        groups.push(group);
        group = [];
        chars = 0;
      }
      group.push({ index, value });
      chars += value.length;
    });
    if (group.length) groups.push(group);

    for (const items of groups) {
      const numbered = items.map(({ index, value }) => `[${index}] ${value.replace(/\s+/g, " ")}`).join("\n---\n");
      const { text } = await generateText({
        model: gateway("google/gemini-2.5-flash-lite"),
        system:
          "Você é um tradutor. Traduza integralmente cada trecho para português do Brasil, preservando tom e conteúdo. Responda APENAS no mesmo formato: cada item começa com `[N]` (mesmo índice recebido) e itens separados por uma linha `---`. Não omita itens nem adicione comentários.",
        prompt: numbered,
      });
      const markers = [...text.matchAll(/(?:^|\n)\s*\[(\d+)\]\s*/g)];
      for (let i = 0; i < markers.length; i += 1) {
        const marker = markers[i];
        const idx = Number(marker[1]);
        const start = (marker.index ?? 0) + marker[0].length;
        const end = markers[i + 1]?.index ?? text.length;
        const val = text.slice(start, end).replace(/\n\s*-{2,}\s*$/g, "").trim();
        if (Number.isFinite(idx) && idx >= 0 && idx < out.length && val) out[idx] = val;
      }
    }
    return out;
  } catch (err) {
    console.warn("[tripadvisor] translateBatchToPt failed:", (err as Error).message);
    return clean;
  }
}

/**
 * O título das páginas do TripAdvisor vem poluído
 * ("ZERMATT HOTEL (GRAMADO): 2026 fotos, comparação de preços e avaliações").
 * Mantém só o nome do hotel, com capitalização natural.
 */
function limparNomeTripAdvisor(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "";
  s = s.split("|")[0];
  s = s.replace(/\s*[:\u2013-]\s*(?:\d{4}\s+)?(?:fotos|comparaç|avaliaç|preços|prices|photos|reviews|updated)[\s\S]*$/i, "");
  s = s.replace(/\s*\([^)]*\)\s*$/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  const temMinuscula = /[a-zà-ÿ]/.test(s);
  if (!temMinuscula) {
    s = s
      .toLocaleLowerCase("pt-BR")
      .split(" ")
      .map((w) => (w.length <= 2 && /^(de|da|do|e|by|of)$/i.test(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
      .join(" ");
  }
  return s;
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


// Busca hotéis por nome (autocomplete).
// Estratégia em camadas: alguns hotéis não voltam com o filtro de categoria,
// com o nome completo ou com palavras extras. Rodamos várias variações da
// consulta em paralelo, unimos e deduplicamos. Também aceita colar a URL do
// TripAdvisor (…-dNNNNN…) para forçar o hotel exato.
export const searchTripAdvisorHotels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string; force?: boolean }) => input)
  .handler(async ({ data }): Promise<TAHotelSuggestion[]> => {
    const q = (data.query || "").trim();
    if (q.length < 3) return [];
    if (taLimitado() && !data.force) throw new Error("TRIPADVISOR_RATE_LIMIT");

    // 1) Colou uma URL/ID do TripAdvisor? Resolve direto pelo location id.
    const idMatch = q.match(/(?:-d|location_id=|\/locations?\/)(\d{3,})/i) ?? (/^\d{4,}$/.test(q) ? [q, q] : null);
    if (idMatch) {
      const id = Number(idMatch[1]);
      const r = await taFetch(`/locations/${id}`);
      if (r.ok) {
        const raw = (await r.json()) as Record<string, unknown>;
        const loc = ((raw.data as Record<string, unknown> | undefined) ?? (raw.location as Record<string, unknown> | undefined) ?? raw);
        const mapped = mapSearch([{ location: loc }]);
        if (mapped.length && mapped[0].location_id) return mapped;
      }
    }

    // 2) Variações de consulta.
    const stripped = q
      .replace(/\b(hotel|hotéis|hoteis|pousada|resort|inn|spa|suites?|apart|flat)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = q.split(/\s+/).filter(Boolean);
    const variants = new Set<string>([q]);
    if (stripped.length >= 3) variants.add(stripped);
    if (words.length > 1) variants.add(words.slice(0, -1).join(" "));
    if (words.length > 2) variants.add(words.slice(0, 2).join(" "));
    if (words.length > 1) variants.add(words[0]);

    // Uma URL por variação (a busca simples já cobre hotéis). Sequencial e com
    // parada antecipada: antes eram até 12 requisições por digitação, o que
    // estourava o limite da chave (429) e deixava a lista sempre vazia.
    const urls = [...variants]
      .slice(0, data.force ? 4 : 2)
      .map((v) => `/catalog/locations/search?query=${encodeURIComponent(v)}&search_type=NAME`);

    const out: TAHotelSuggestion[] = [];
    const seen = new Set<number>();
    let limitado = false;
    let houveResposta = false;

    for (const u of urls) {
      if (taLimitado() && houveResposta) break;
      try {
        const r = await taFetch(u);
        if (r.status === 429) { limitado = true; break; }
        if (!r.ok) continue;
        houveResposta = true;
        const j = (await r.json()) as { data?: Array<{ location?: Record<string, unknown> }> };
        for (const item of mapSearch(j.data ?? [], 30)) {
          if (!item.location_id || seen.has(item.location_id) || !item.name) continue;
          seen.add(item.location_id);
          out.push(item);
        }
      } catch {
        // ignora falha pontual e tenta a próxima variação
      }
      if (out.length >= 5) break;
    }

    if (!out.length && limitado) throw new Error("TRIPADVISOR_RATE_LIMIT");

    // Prioriza quem contém as palavras digitadas no nome.
    const terms = (stripped || q).toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const score = (h: TAHotelSuggestion) => {
      const name = h.name.toLowerCase();
      return terms.reduce((acc, t) => acc + (name.includes(t) ? 1 : 0), 0);
    };
    out.sort((a, b) => score(b) - score(a) || (b.rating ?? 0) - (a.rating ?? 0));
    return out.slice(0, 12);
  });

function mapSearch(list: Array<{ location?: Record<string, unknown> }>, limit = 8): TAHotelSuggestion[] {
  return list.slice(0, limit).map((item) => {
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
    // A Terra API rate-limita agressivamente por chave. Fazer múltiplas páginas
    // em paralelo dispara 429 em quase todas — usamos 1 request por endpoint
    // com limit alto e 1 retentativa após pequeno backoff se cair em 429.
    async function fetchWithRetry(path: string, params: Record<string, string>) {
      let r = await taFetch(path, params);
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 900));
        r = await taFetch(path, params);
      }
      return r;
    }

    const [rDet, rPhotos, rReviews] = await Promise.all([
      fetchWithRetry(`/locations/${id}`, {}),
      fetchWithRetry(`/locations/${id}/photos`, { limit: "50" }),
      // Não filtre por português: para muitos hotéis a API retorna zero itens
      // mesmo havendo avaliações em outros idiomas. Buscamos todas e traduzimos
      // o conteúdo abaixo antes de enviá-lo para a interface.
      fetchWithRetry(`/locations/${id}/reviews`, { limit: "40" }),
    ]);

    const empty: TAPublicHotelInfo = {
      location_id: id, name: "", description: null, description_translated_from: null,
      address: null, rating: null, num_reviews: null, ranking: null, hotel_class: null,
      price_level: null, amenities: [], awards: [], photos: [], reviews: [],
      tripadvisor_url: null, rating_histogram: null, subratings: [],
    };

    if (!rDet.ok) {
      console.warn("[tripadvisor-public] details failed", id, rDet.status, await rDet.text().catch(() => ""));
      return empty;
    }

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
      const seen = new Set<string>();
      for (const p of jp.data || []) {
        const purl = p.photo?.original_size_url ?? p.photo?.large_size_url;
        if (typeof purl === "string" && purl.length > 0 && !seen.has(purl)) {
          seen.add(purl);
          photos.push(purl);
        }
      }
    } else {
      console.warn("[tripadvisor-public] photos failed", id, rPhotos.status);
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
      for (const r of jr.data || []) {
        const user = (r.user as {
          username?: string;
          geo?: string;
          user_location?: { name?: string } | string;
        } | undefined);
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
          published_date: (r.publish_ts as string) || (r.published_date as string) || null,
          user_name: user?.username ?? null,
          user_location: localizedText(
            typeof user?.user_location === "object" ? user.user_location.name : user?.user_location,
          ) || localizedText(user?.geo) || null,
          trip_type: localizedText(r.trip_type) || null,
          lang,
        });
      }
    } else {
      console.warn("[tripadvisor-public] reviews failed", id, rReviews.status);
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
      .sort((a, b) => {
        const ad = a.published_date ? new Date(a.published_date).getTime() : 0;
        const bd = b.published_date ? new Date(b.published_date).getTime() : 0;
        if (bd !== ad) return bd - ad;
        return (b.rating ?? 0) - (a.rating ?? 0);
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


// ---------------------------------------------------------------------------
// Hotel por LINK do TripAdvisor (não usa a busca da API — economiza cota).
// ---------------------------------------------------------------------------

export function parseTripAdvisorUrl(input: string): { locationId: number | null; url: string | null } {
  const s = (input || "").trim();
  const m = s.match(/tripadvisor\.[^\s]*\/[^\s]*?-d(\d+)/i);
  if (!m) return { locationId: null, url: null };
  const raw = s.match(/https?:\/\/[^\s]+/i)?.[0] ?? null;
  return { locationId: Number(m[1]), url: raw };
}

/**
 * Lê o HTML da página do hotel. O TripAdvisor bloqueia requisições diretas
 * (403), então caímos para o Firecrawl quando disponível.
 */
async function lerPaginaTripAdvisor(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    if (res.ok) {
      const html = await res.text();
      if (html.length > 5000) return html;
    }
  } catch {
    // segue para o Firecrawl
  }

  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const firecrawlKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableApiKey || !firecrawlKey) return null;

  try {
    const r = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": firecrawlKey,
      },
      body: JSON.stringify({ url, formats: ["rawHtml", "markdown"], onlyMainContent: false }),
    });
    if (!r.ok) {
      console.warn(`[tripadvisor] Firecrawl ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
      return null;
    }
    const j = (await r.json()) as {
      rawHtml?: string;
      html?: string;
      markdown?: string;
      data?: { rawHtml?: string; html?: string; markdown?: string };
    };
    return j.rawHtml || j.html || j.markdown || j.data?.rawHtml || j.data?.html || j.data?.markdown || null;
  } catch (e) {
    console.warn("[tripadvisor] Firecrawl falhou", e);
    return null;
  }
}

function scrapePhotos(html: string, limit: number): string[] {

  const out: string[] = [];
  const seen = new Set<string>();
  const re = /https:\/\/(?:dynamic-)?media[^"'\s\\]*tripadvisor\.com\/media\/photo-[a-z]\/[^"'\s\\]+?\.(?:jpg|jpeg|webp)/gi;
  for (const m of html.matchAll(re)) {
    const u = m[0].replace(/\\u002F/gi, "/");
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Busca dados do hotel a partir do link público do TripAdvisor.
 * 1) tenta a API oficial pelo location_id extraído da URL;
 * 2) se a API falhar (429/sem chave), faz scraping da própria página.
 */
export const getTripAdvisorHotelByUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string; photoLimit?: number }) => input)
  .handler(async ({ data }): Promise<TAHotelDetails> => {
    const limit = Math.min(Math.max(data.photoLimit ?? 5, 1), 10);
    const { locationId, url } = parseTripAdvisorUrl(data.url);
    if (!locationId || !url) throw new Error("Link do TripAdvisor inválido");

    let det: TAHotelDetails | null = null;
    if (!taLimitado()) {
      try {
        const [rDet, rPhotos] = await Promise.all([
          taFetch(`/locations/${locationId}`),
          taFetch(`/locations/${locationId}/photos?limit=${limit}`),
        ]);
        if (rDet.ok) {
          const rawDet = (await rDet.json()) as Record<string, unknown>;
          const d = ((rawDet.data as Record<string, unknown> | undefined)
            ?? (rawDet.location as Record<string, unknown> | undefined)
            ?? rawDet);
          const addr = pickAddress(d.addresses as Array<Record<string, unknown>> | undefined);
          const coords = (d.coordinates as { latitude?: number; longitude?: number } | undefined) || undefined;
          const phones = d.phone_numbers as Array<{ value?: string }> | undefined;
          const websites = d.websites as Array<{ url?: string }> | undefined;
          let photos: string[] = [];
          if (rPhotos.ok) {
            const jp = (await rPhotos.json()) as { data?: Array<{ photo?: { original_size_url?: string; large_size_url?: string } }> };
            photos = (jp.data || [])
              .map((p) => p.photo?.original_size_url ?? p.photo?.large_size_url)
              .filter((u): u is string => typeof u === "string" && u.length > 0)
              .slice(0, limit);
          }
          det = {
            location_id: locationId,
            name: pickName(d.names as Array<{ language?: string; value?: string; primary?: boolean }>),
            address: addr?.formatted ?? null,
            city: addr?.city ?? null,
            country: addr?.country ?? null,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            rating: extractRating(d),
            tripadvisor_url: (d.urls as { tripadvisor?: { main?: string } } | undefined)?.tripadvisor?.main ?? url,
            phone: phones?.[0]?.value ?? null,
            website: websites?.[0]?.url ?? null,
            photos,
            description: localizedText(d.description) || null,
            hotel_class: extractHotelClass(d),
          };
        }
      } catch {
        det = null;
      }
    }

    // Fallback: leitura da página pública (o TripAdvisor bloqueia fetch direto,
    // então usamos o Firecrawl quando o acesso simples devolve 403).
    if (!det || !det.name || det.photos.length === 0 || det.rating == null || det.hotel_class == null) {
      try {
        const html = await lerPaginaTripAdvisor(url);
        if (html) {

          const nameFromUrl = url.match(/-Reviews-([^-]+(?:_[^-]+)*)-/)?.[1]?.replace(/_/g, " ") ?? "";
          const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
          const name = limparNomeTripAdvisor(det?.name || ogTitle || nameFromUrl);
          const desc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
          const ratingStr = html.match(/"ratingValue"\s*:\s*"?([0-5](?:[.,]\d)?)/i)?.[1];
          const addrStreet = html.match(/"streetAddress"\s*:\s*"([^"]+)"/i)?.[1] ?? null;
          const addrCity = html.match(/"addressLocality"\s*:\s*"([^"]+)"/i)?.[1] ?? null;
          const addrCountry = html.match(/"addressCountry"\s*:\s*"([^"]+)"/i)?.[1] ?? null;
          const starStr = html.match(/"starRating"\s*:\s*\{[^}]*"ratingValue"\s*:\s*"?([1-5](?:\.\d)?)/i)?.[1];
          const photos = det?.photos.length ? det.photos : scrapePhotos(html, limit);
          det = {
            location_id: locationId,
            name: name || det?.name || "",
            address: det?.address ?? (addrStreet ? [addrStreet, addrCity, addrCountry].filter(Boolean).join(", ") : null),
            city: det?.city ?? addrCity,
            country: det?.country ?? addrCountry,
            latitude: det?.latitude ?? null,
            longitude: det?.longitude ?? null,
            rating: det?.rating ?? (ratingStr ? Number(ratingStr.replace(",", ".")) : null),
            tripadvisor_url: det?.tripadvisor_url ?? url,
            phone: det?.phone ?? null,
            website: det?.website ?? null,
            photos,
            description: det?.description ?? (desc ? desc.slice(0, 800) : null),
            hotel_class: det?.hotel_class ?? (starStr ? Math.round(Number(starStr)) : null),
          };
        }
      } catch {
        // mantém o que já temos
      }
    }

    // Mesmo quando API e leitura pública estão temporariamente indisponíveis,
    // preserve o vínculo pelo location_id e use o nome legível da própria URL.
    if (!det) {
      const nameFromUrl = url.match(/-Reviews-([^-]+(?:_[^-]+)*)-/)?.[1]?.replace(/_/g, " ").trim() ?? "";
      det = {
        location_id: locationId,
        name: limparNomeTripAdvisor(nameFromUrl) || `Hotel TripAdvisor ${locationId}`,
        address: null,
        city: null,
        country: null,
        latitude: null,
        longitude: null,
        rating: null,
        tripadvisor_url: url,
        phone: null,
        website: null,
        photos: [],
        description: null,
        hotel_class: null,
      };
    }
    return det;
  });
