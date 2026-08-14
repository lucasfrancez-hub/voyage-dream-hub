/**
 * Enriquecimento de hotel para o orçamento público (TripAdvisor Content API).
 * SERVER-ONLY.
 *
 * Entrega: fotos reais, endereço, coordenadas, categoria (estrelas),
 * comodidades (benefícios) e pontos de interesse próximos.
 *
 * O resultado é cacheado (30 dias) para não repetir chamadas a cada
 * abertura do link público.
 */

export type HotelNearby = { name: string; distance: string };

export type HotelEnrichment = {
  name: string | null;
  rating: number | null;
  num_reviews: number | null;
  ranking: string | null;
  address: string | null;
  description: string | null;
  photos: string[];
  amenities: string[];
  web_url: string | null;
  latitude: number | null;
  longitude: number | null;
  stars: number | null;
  nearby: HotelNearby[];
  /** Diagnóstico interno — nunca exibido ao cliente. */
  status: "OK" | "PARTIAL" | "MATCH_FAILED";
};

const CACHE_DAYS = 30;
// A Content API pública (api.content.tripadvisor.com) responde 403 para a
// nossa chave; o restante do projeto usa a API Terra com X-API-KEY.
const BASE = "https://terra.tripadvisor.com/api";

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function cacheKey(name: string, city: string | null): string {
  // v3 — inclui endereço/descrição em português e pontos próximos.
  return `hotel-enrich:v3:${norm(name)}|${norm(city ?? "")}`;
}

async function readCache(key: string): Promise<HotelEnrichment | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("md_response_cache")
      .select("payload,fetched_at")
      .eq("url", key)
      .maybeSingle();
    if (!data?.payload) return null;
    const idade = Date.now() - Date.parse(String(data.fetched_at));
    if (idade > CACHE_DAYS * 86400_000) return null;
    return data.payload as HotelEnrichment;
  } catch {
    return null;
  }
}

async function writeCache(key: string, payload: HotelEnrichment): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    await supabaseAdmin
      .from("md_response_cache")
      .upsert({
        url_hash: hash,
        url: key,
        payload: JSON.parse(JSON.stringify(payload)),
        fetched_at: new Date().toISOString(),
      });
  } catch { /* cache é best-effort */ }
}

type Localized = Array<{ language?: string; value?: string; primary?: boolean }> | undefined;

/** Escolhe o texto em pt e cai para o principal/primeiro disponível. */
function localized(raw: unknown): string | null {
  const list = raw as Localized;
  if (!Array.isArray(list) || !list.length) return null;
  const pt = list.find((i) => String(i.language ?? "").startsWith("pt") && i.value);
  const primary = list.find((i) => i.primary && i.value);
  return (pt?.value ?? primary?.value ?? list.find((i) => i.value)?.value ?? null) || null;
}

function pickName(raw: unknown): string {
  return localized(raw) ?? "";
}

function pickAddress(addresses: Array<Record<string, unknown>> | undefined): string | null {
  if (!Array.isArray(addresses) || !addresses.length) return null;
  const a = (addresses.find((x) => x.primary) ?? addresses[0]) as Record<string, unknown>;
  const formatted = a.formatted ?? a.formatted_address ?? a.address_string;
  if (typeof formatted === "string" && formatted.trim()) return formatted.trim();
  const partes = [a.street1, a.city, a.state, a.country].filter((p) => typeof p === "string" && p);
  return partes.length ? partes.join(", ") : null;
}

async function jsonOf(
  url: string,
  signal: AbortSignal,
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, {
      signal,
      headers: { accept: "application/json", "X-API-KEY": apiKey },
    });
    if (!r.ok) {
      console.warn("[hotel-enrichment] TripAdvisor", r.status, url.split("?")[0]);
      return null;
    }
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}


/**
 * Busca e monta o enriquecimento do hotel. Retorna `MATCH_FAILED` quando
 * o TripAdvisor não encontra a propriedade — nunca inventa dados.
 */
export async function enrichHotel(params: {
  name: string;
  city?: string | null;
  destination?: string | null;
  /** Ignora o cache e refaz a consulta. */
  force?: boolean;
}): Promise<HotelEnrichment | null> {
  const nome = String(params.name ?? "").trim();
  if (!nome) return null;

  const apiKey = process.env["TRIPADVISOR_API_KEY"];
  const local = params.city ?? params.destination ?? null;
  const key = cacheKey(nome, local);

  if (!params.force) {
    const hit = await readCache(key);
    if (hit) return hit;
  }
  if (!apiKey) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  const api = (path: string) => jsonOf(`${BASE}${path}`, ctrl.signal, apiKey);

  const vazio: HotelEnrichment = {
    name: nome, rating: null, num_reviews: null, ranking: null, address: null,
    description: null, photos: [], amenities: [], web_url: null,
    latitude: null, longitude: null, stars: null, nearby: [], status: "MATCH_FAILED",
  };

  try {
    const query = local ? `${nome} ${local}` : nome;
    const search =
      (await api(`/catalog/locations/search?query=${encodeURIComponent(query)}&search_type=NAME&category=HOTEL`)) ??
      (await api(`/catalog/locations/search?query=${encodeURIComponent(nome)}&search_type=NAME&category=HOTEL`));

    const candidatos = ((search?.data ?? []) as Array<{ location?: Record<string, unknown> }>)
      .map((item) => (item.location ?? item) as Record<string, unknown>)
      .filter((loc) => loc?.id != null)
      .map((loc) => ({ id: Number(loc.id), name: pickName(loc.names) }));

    const alvo = norm(nome);
    const escolhido =
      candidatos.find((c) => norm(c.name) === alvo) ??
      candidatos.find((c) => norm(c.name).includes(alvo) || alvo.includes(norm(c.name))) ??
      candidatos[0];
    if (!escolhido) {
      await writeCache(key, vazio);
      return vazio;
    }

    const [detailsRaw, photosJson] = await Promise.all([
      api(`/locations/${escolhido.id}`),
      api(`/locations/${escolhido.id}/photos?limit=12`),
    ]);

    const d = ((detailsRaw?.data as Record<string, unknown> | undefined)
      ?? (detailsRaw?.location as Record<string, unknown> | undefined)
      ?? detailsRaw
      ?? {}) as Record<string, unknown>;

    const photos = ((photosJson?.data ?? []) as Array<{ photo?: Record<string, unknown> }>)
      .map((p) => String(p.photo?.original_size_url ?? p.photo?.url ?? ""))
      .filter(Boolean);

    const endereco = pickAddress(d.addresses as Array<Record<string, unknown>> | undefined);
    const amenities = Array.isArray(d.amenities)
      ? (d.amenities as Array<{ name?: string; localized_name?: string } | string>)
          .map((a) => (typeof a === "string" ? a : a?.localized_name ?? a?.name ?? ""))
          .filter(Boolean)
          .slice(0, 8)
      : [];

    const coords = (d.coordinates ?? {}) as { latitude?: number; longitude?: number };
    const lat = coords.latitude != null ? Number(coords.latitude) : null;
    const lng = coords.longitude != null ? Number(coords.longitude) : null;

    const estrelas = (() => {
      const raw = (d.hotel_class ?? (d as { class?: unknown }).class) as unknown;
      const n = Number(typeof raw === "string" ? raw.replace(",", ".") : raw);
      return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
    })();

    const nota = ((): number | null => {
      const raw = (d.rating ?? (d as { review_rating?: unknown }).review_rating) as unknown;
      const n = Number(typeof raw === "string" ? raw.replace(",", ".") : raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();

    const out: HotelEnrichment = {
      name: pickName(d.names) || escolhido.name || nome,
      rating: nota,
      num_reviews: d.num_reviews != null ? Number(d.num_reviews) : null,
      ranking: null,
      address: endereco,
      description: localized(d.descriptions),
      photos,
      amenities,
      web_url: (d.urls as { tripadvisor?: { main?: string } } | undefined)?.tripadvisor?.main ?? null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      stars: estrelas,
      nearby: [],
      status: photos.length && (lat != null || endereco) ? "OK" : "PARTIAL",
    };

    await writeCache(key, out);
    return out;
  } catch {
    return vazio;
  } finally {
    clearTimeout(timer);
  }
}
