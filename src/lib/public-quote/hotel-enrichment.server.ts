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

function cacheKey(name: string, city: string | null, locationId?: number | null): string {
  // v4 — inclui endereço/descrição em português e pontos próximos.
  const pin = locationId ? `|ta${locationId}` : "";
  return `hotel-enrich:v4:${norm(name)}|${norm(city ?? "")}${pin}`;
}

/** Chave estável do hotel usada no vínculo manual com o TripAdvisor. */
export function hotelLinkKey(name: string, city?: string | null): string {
  return `${norm(name)}|${norm(city ?? "")}`;
}

/** Busca o vínculo manual (Editar → TripAdvisor) salvo para este hotel. */
async function readPinnedLocation(name: string, city: string | null): Promise<number | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const chaves = [hotelLinkKey(name, city), hotelLinkKey(name, null)];
    const { data } = await supabaseAdmin
      .from("hotel_tripadvisor_links")
      .select("hotel_key, location_id")
      .in("hotel_key", chaves);
    if (!data?.length) return null;
    const exata = data.find((d) => d.hotel_key === chaves[0]) ?? data[0];
    const id = Number(exata.location_id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** Remove o cache de enriquecimento de um hotel (após vincular manualmente). */
export async function limparCacheHotel(name: string, city?: string | null): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("md_response_cache")
      .delete()
      .like("url", `hotel-enrich:v4:${norm(name)}|%`);
  } catch { /* best effort */ }
}

export type HotelCandidate = {
  id: number;
  name: string;
  address: string | null;
  stars: number | null;
  web_url: string | null;
};

/** Busca propriedades no TripAdvisor para o vínculo manual. */
export async function searchHotelLocations(query: string): Promise<HotelCandidate[]> {
  const apiKey = process.env["TRIPADVISOR_API_KEY"];
  const termo = String(query ?? "").trim();
  if (!apiKey || termo.length < 3) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const search = await jsonOf(
      `${BASE}/catalog/locations/search?query=${encodeURIComponent(termo)}&search_type=NAME&category=HOTEL`,
      ctrl.signal,
      apiKey,
    );
    const brutos = ((search?.data ?? []) as Array<{ location?: Record<string, unknown> }>)
      .map((item) => (item.location ?? item) as Record<string, unknown>)
      .filter((loc) => loc?.id != null)
      .slice(0, 8);

    return await Promise.all(
      brutos.map(async (loc) => {
        const id = Number(loc.id);
        const det = await jsonOf(`${BASE}/locations/${id}`, ctrl.signal, apiKey);
        const d = ((det?.data as Record<string, unknown> | undefined) ?? det ?? {}) as Record<string, unknown>;
        const estrelasRaw = (d.hotel_class ?? (d as { class?: unknown }).class) as unknown;
        const estrelas = Number(typeof estrelasRaw === "string" ? estrelasRaw.replace(",", ".") : estrelasRaw);
        return {
          id,
          name: pickName(d.names) || pickName(loc.names) || `Propriedade ${id}`,
          address: pickAddress(d.addresses as Array<Record<string, unknown>> | undefined),
          stars: Number.isFinite(estrelas) && estrelas >= 1 && estrelas <= 5 ? Math.round(estrelas) : null,
          web_url: (d.urls as { tripadvisor?: { main?: string } } | undefined)?.tripadvisor?.main ?? null,
        };
      }),
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
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

/** Traduz termos administrativos comuns que a API devolve em inglês. */
function ptTermo(valor: string): string {
  return valor
    .replace(/^State of\s+/i, "")
    .replace(/^Province of\s+/i, "")
    .replace(/\bBrazil\b/gi, "Brasil")
    .replace(/\bUnited States\b/gi, "Estados Unidos")
    .replace(/\bSpain\b/gi, "Espanha")
    .replace(/\bItaly\b/gi, "Itália")
    .replace(/\bFrance\b/gi, "França")
    .replace(/\bPortugal\b/gi, "Portugal")
    .replace(/\bArgentina\b/gi, "Argentina")
    .replace(/\bChile\b/gi, "Chile")
    .replace(/\bMexico\b/gi, "México")
    .trim();
}

/** Monta o endereço em português a partir das partes (evita o "formatted" em inglês). */
function pickAddress(addresses: Array<Record<string, unknown>> | undefined): string | null {
  if (!Array.isArray(addresses) || !addresses.length) return null;
  const a = (addresses.find((x) => x.primary) ?? addresses[0]) as Record<string, unknown>;
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? ptTermo(v.trim()) : null);
  const rua = txt(a.street_address) ?? txt(a.street1);
  const cidade = txt(a.city);
  const estado = txt(a.state);
  const cep = txt(a.postal_code);
  const pais = txt(a.country_name);
  const linha1 = [rua, cidade, estado].filter(Boolean).join(", ");
  const linha2 = [cep, pais].filter(Boolean).join(" • ");
  const montado = [linha1, linha2].filter(Boolean).join(" — ");
  if (montado) return montado;
  const formatted = a.formatted ?? a.formatted_address ?? a.address_string;
  return typeof formatted === "string" && formatted.trim() ? ptTermo(formatted.trim()) : null;
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
  /** Propriedade TripAdvisor fixada manualmente (Editar → vincular). */
  locationId?: number | null;
}): Promise<HotelEnrichment | null> {
  const nome = String(params.name ?? "").trim();
  if (!nome) return null;

  const apiKey = process.env["TRIPADVISOR_API_KEY"];
  const local = params.city ?? params.destination ?? null;
  const fixado = params.locationId ?? (await readPinnedLocation(nome, local));
  const key = cacheKey(nome, local, fixado);

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
    // Variantes de nome: fornecedores mandam "OYO Hotel San Remo, Sao Paulo",
    // "Hotel X (Centro)" etc. Sem limpar, o TripAdvisor não acha a propriedade.
    const variantes: string[] = [];
    const push = (s: string) => {
      const v = s.replace(/\s+/g, " ").trim();
      if (v.length >= 3 && !variantes.some((x) => norm(x) === norm(v))) variantes.push(v);
    };
    push(nome);
    push(nome.replace(/\s*\([^)]*\)\s*/g, " "));
    push(nome.split(/\s*[,\-–|]\s*/)[0] ?? nome);
    if (local) {
      const cidade = norm(local.split(/[,(]/)[0] ?? local);
      const semCidade = nome
        .split(/\s*,\s*/)
        .filter((p) => norm(p) !== cidade)
        .join(", ");
      push(semCidade);
    }

    const consultas = local
      ? [...variantes.map((v) => `${v} ${local}`), ...variantes]
      : variantes;

    let search: Record<string, unknown> | null = null;
    let candidatos: Array<{ id: number; name: string }> = [];
    if (!fixado) {
      for (const q of consultas) {
        search = await api(
          `/catalog/locations/search?query=${encodeURIComponent(q)}&search_type=NAME&category=HOTEL`,
        );
        candidatos = ((search?.data ?? []) as Array<{ location?: Record<string, unknown> }>)
          .map((item) => (item.location ?? item) as Record<string, unknown>)
          .filter((loc) => loc?.id != null)
          .map((loc) => ({ id: Number(loc.id), name: pickName(loc.names) }));
        if (candidatos.length) break;
      }
    }

    const alvos = variantes.map(norm);
    const escolhido = fixado
      ? { id: fixado, name: nome }
      : (candidatos.find((c) => alvos.some((a) => norm(c.name) === a)) ??
         candidatos.find((c) => alvos.some((a) => norm(c.name).includes(a) || a.includes(norm(c.name)))) ??
         candidatos[0]);
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

    const travelerRatings = (d.traveler_ratings ?? {}) as {
      overall?: { rating?: number; count?: number };
    };

    const nota = ((): number | null => {
      const raw = (travelerRatings.overall?.rating
        ?? d.rating
        ?? (d as { review_rating?: unknown }).review_rating) as unknown;
      const n = Number(typeof raw === "string" ? raw.replace(",", ".") : raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();

    const avaliacoes = ((): number | null => {
      const raw = travelerRatings.overall?.count ?? d.num_reviews;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();

    // Descrição e comodidades chegam em inglês: traduzimos para pt-BR.
    const descricaoBruta = localized(d.descriptions);
    const { translateToPt } = await import("./translate-pt.server");
    const traduzidos = await translateToPt([descricaoBruta ?? "", ...amenities]).catch(
      () => [descricaoBruta ?? "", ...amenities],
    );
    const descricao = traduzidos[0]?.trim() || descricaoBruta;
    const comodidades = traduzidos.slice(1).map((a, i) => a?.trim() || amenities[i]).filter(Boolean);

    const proximos = lat != null && lng != null
      ? await (await import("./nearby.server")).nearbyPlaces(lat, lng, 5).catch(() => [])
      : [];

    const out: HotelEnrichment = {
      name: pickName(d.names) || escolhido.name || nome,
      rating: nota,
      num_reviews: avaliacoes,
      ranking: null,
      address: endereco,
      description: descricao,
      photos,
      amenities: comodidades,
      web_url: (d.urls as { tripadvisor?: { main?: string } } | undefined)?.tripadvisor?.main ?? null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      stars: estrelas,
      nearby: proximos,
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
