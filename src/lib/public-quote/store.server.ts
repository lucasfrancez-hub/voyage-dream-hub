/**
 * Persistência dos orçamentos públicos (AIR_ONLY / TRIP_PACKAGE).
 * SERVER-ONLY. Usa o client admin porque o link público é lido sem sessão.
 */
import type { PublicQuote } from "./types";

export const PUBLIC_BASE = "https://pedidos.viaair.tur.br";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomId(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type NewPublicQuote = Omit<
  PublicQuote,
  "id" | "publicId" | "createdAt" | "updatedAt" | "expired" | "shortUrl"
> & {
  orderId?: string | null;
  conversationId?: string | null;
  flightQuoteId?: string | null;
  optionIndex?: number | null;
};

function toRow(q: NewPublicQuote, publicId: string) {
  return {
    public_id: publicId,
    quote_type: q.type,
    title: q.title,
    subtitle: q.subtitle ?? null,
    origin: q.origin ?? null,
    destination: q.destination ?? null,
    start_date: q.startDate ?? null,
    end_date: q.endDate ?? null,
    passengers: q.passengers as unknown as Record<string, unknown>,
    products: q.products as unknown as Record<string, unknown>,
    payment: q.payment as unknown as Record<string, unknown>,
    totals: q.totals as unknown as Record<string, unknown>,
    summary: q.summary as unknown as Record<string, unknown>,
    agent: (q.agent ?? null) as unknown as Record<string, unknown> | null,
    extra: {
      nights: q.nights ?? null,
      tripKind: q.tripKind ?? null,
      cabin: q.cabin ?? null,
      options: q.options ?? null,
    } as unknown as Record<string, unknown>,
    valid_until: q.validUntil ?? null,
    public_notes: q.publicNotes ?? null,
    order_id: q.orderId ?? null,
    conversation_id: q.conversationId ?? null,
    quote_id: q.flightQuoteId ?? null,
    option_index: q.optionIndex ?? null,
    source: q.source?.type ?? "SYSTEM",
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToQuote(row: any): PublicQuote {
  const extra = (row.extra ?? {}) as Record<string, any>;
  const validUntil: string | null = row.valid_until ?? null;
  return {
    id: row.id,
    publicId: row.public_id,
    shortUrl: row.short_url ?? null,
    type: row.quote_type,
    title: row.title,
    subtitle: row.subtitle,
    origin: row.origin,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    nights: extra.nights ?? null,
    tripKind: extra.tripKind ?? null,
    cabin: extra.cabin ?? null,
    passengers: row.passengers ?? { adults: 1, children: 0, infants: 0, label: "1 adulto" },
    products: row.products ?? {},
    options: extra.options ?? undefined,
    payment: row.payment,
    totals: row.totals,
    summary: row.summary ?? [],
    agent: row.agent ?? null,
    source: { type: row.source ?? "SYSTEM", conversationId: row.conversation_id ?? null },
    validUntil,
    expired: validUntil ? new Date(validUntil).getTime() < Date.now() : false,
    publicNotes: row.public_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function publicQuoteUrl(publicId: string): string {
  return `${PUBLIC_BASE}/orcamento/${publicId}`;
}

/** Cria (ou reaproveita) um orçamento público e devolve link + link curto. */
export async function savePublicQuote(
  q: NewPublicQuote,
): Promise<{ quote: PublicQuote; url: string; shortUrl: string | null }> {
  const supabaseAdmin = await db();

  // reaproveita quando é a mesma opção de voo já publicada
  if (q.flightQuoteId && q.optionIndex != null) {
    const { data: existente } = await supabaseAdmin
      .from("public_quotes")
      .select("*")
      .eq("quote_id", q.flightQuoteId)
      .eq("option_index", q.optionIndex)
      .maybeSingle();
    if (existente) {
      const quote = rowToQuote(existente);
      return { quote, url: publicQuoteUrl(quote.publicId), shortUrl: quote.shortUrl ?? null };
    }
  }

  let publicId = "";
  let row: unknown = null;
  for (let i = 0; i < 5; i++) {
    publicId = randomId(10);
    const { data, error } = await supabaseAdmin
      .from("public_quotes")
      .insert(toRow(q, publicId) as never)
      .select("*")
      .single();
    if (!error && data) {
      row = data;
      break;
    }
    if (error && error.code !== "23505") throw new Error(error.message);
  }
  if (!row) throw new Error("Não foi possível gerar o orçamento público.");

  const url = publicQuoteUrl(publicId);
  const shortUrl = await criarLinkCurto(url, `Orçamento ${q.title}`.slice(0, 110));
  if (shortUrl) {
    await supabaseAdmin
      .from("public_quotes")
      .update({ short_url: shortUrl, short_slug: shortUrl.split("/").pop() ?? null } as never)
      .eq("public_id", publicId);
  }

  const quote = rowToQuote({ ...(row as Record<string, unknown>), short_url: shortUrl });
  return { quote, url, shortUrl };
}

/** Encurtador VIA AIR (/l/<slug>) — best effort. */
export async function criarLinkCurto(target: string, label: string): Promise<string | null> {
  const supabaseAdmin = await db();
  for (let i = 0; i < 5; i++) {
    const slug = randomId(6);
    const { error } = await supabaseAdmin
      .from("short_links")
      .insert({ slug, target_url: target, label } as never);
    if (!error) return `${PUBLIC_BASE}/l/${slug}`;
    if (error.code !== "23505") return null;
  }
  return null;
}

/**
 * Completa hotéis sem foto/endereço com dados do TripAdvisor (cacheados).
 * Nunca sobrescreve foto manual nem inventa dados: se não achar, segue igual.
 */
async function enriquecerHoteis(quote: PublicQuote): Promise<PublicQuote> {
  const { enrichHotel } = await import("./hotel-enrichment.server");

  const enriquecer = async (hotels: PublicQuote["products"]["hotels"]) => {
    if (!hotels?.length) return hotels;
    return await Promise.all(
      hotels.map(async (h) => {
        const faltaFoto = !h.photos?.length;
        const faltaLocal = !h.location || (!h.location.address && h.location.latitude == null);
        const faltaSobre = !h.about || !h.location?.nearbyPlaces?.length;
        if (!faltaFoto && !faltaLocal && !faltaSobre) return h;
        const info = await enrichHotel({ name: h.name, city: quote.destination }).catch(() => null);
        if (!info || info.status === "MATCH_FAILED") return h;
        return {
          ...h,
          stars: h.stars ?? info.stars,
          place: h.place ?? info.address,
          photos: h.photos?.length ? h.photos : info.photos,
          benefits: h.benefits?.length ? h.benefits : info.amenities.slice(0, 6),
          about: h.about ?? info.description,
          rating: h.rating ?? info.rating,
          reviewsCount: h.reviewsCount ?? info.num_reviews,
          location:
            faltaLocal && (info.latitude != null || info.address)
              ? {
                  latitude: info.latitude,
                  longitude: info.longitude,
                  address: info.address,
                  nearbyPlaces: info.nearby,
                }
              : h.location,
          mapsUrl:
            h.mapsUrl ??
            (info.latitude != null && info.longitude != null
              ? `https://www.google.com/maps/search/?api=1&query=${info.latitude},${info.longitude}`
              : null),
        };
      }),
    );
  };

  const products = { ...quote.products, hotels: await enriquecer(quote.products.hotels) };
  const options = quote.options
    ? await Promise.all(
        quote.options.map(async (o) => ({
          ...o,
          products: { ...o.products, hotels: await enriquecer(o.products.hotels) },
        })),
      )
    : quote.options;

  return { ...quote, products, options };
}

export async function getPublicQuoteByPublicId(publicId: string): Promise<PublicQuote | null> {
  const supabaseAdmin = await db();
  const { data } = await supabaseAdmin
    .from("public_quotes")
    .select("*")
    .eq("public_id", publicId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  await supabaseAdmin
    .from("public_quotes")
    .update({
      view_count: (Number(row.view_count) || 0) + 1,
      last_viewed_at: new Date().toISOString(),
    } as never)
    .eq("public_id", publicId);
  const quote = rowToQuote(row);
  return await enriquecerHoteis(quote).catch(() => quote);
}

export async function registrarEventoOrcamento(
  publicQuoteId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const supabaseAdmin = await db();
  await supabaseAdmin
    .from("public_quote_events")
    .insert({ public_quote_id: publicQuoteId, event_type: eventType, payload } as never);
}
