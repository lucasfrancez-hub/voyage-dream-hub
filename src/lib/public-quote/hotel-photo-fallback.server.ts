const BUCKET = "package-hotel-photos";
const MAX_PHOTOS = 5;
const MAX_BYTES = 12 * 1024 * 1024;

function norm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(hotel|resort|pousada|by|gav|hoteis|hotels)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMatchingHotel(expected: string, found: string) {
  const a = norm(expected);
  const b = norm(found);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokens = a.split(" ").filter((token) => token.length > 2);
  return tokens.length > 0 && tokens.filter((token) => b.includes(token)).length / tokens.length >= 0.75;
}

function extensionFor(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("avif")) return "avif";
  return "jpg";
}

async function googlePlacePhotos(hotelName: string, city: string | null, apiKey: string) {
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.photos",
      },
      body: JSON.stringify({
        textQuery: `${hotelName}${city ? `, ${city}` : ""}`,
        languageCode: "pt-BR",
        regionCode: "BR",
        includedType: "hotel",
        maxResultCount: 5,
      }),
    });
    if (!response.ok) return [];
    const json = (await response.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        formattedAddress?: string;
        photos?: Array<{ name?: string }>;
      }>;
    };
    const place = (json.places ?? []).find((item) =>
      isMatchingHotel(hotelName, item.displayName?.text ?? ""),
    );
    return (place?.photos ?? []).map((photo) => photo.name).filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

/** Busca a ficha exata no Google Places e salva até cinco fotos oficiais. */
export async function recoverHotelPhotos(
  hotelName: string,
  city: string | null,
): Promise<string[]> {
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!apiKey) return [];
  const photoNames = await googlePlacePhotos(hotelName, city, apiKey);
  if (!photoNames.length) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const folder = crypto.randomUUID();
  const persisted: string[] = [];

  for (const photoName of photoNames) {
    if (persisted.length >= MAX_PHOTOS) break;
    try {
      const url = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
      url.searchParams.set("maxWidthPx", "1600");
      url.searchParams.set("maxHeightPx", "1200");
      url.searchParams.set("skipHttpRedirect", "false");
      url.searchParams.set("key", apiKey);
      const response = await fetch(url, {
        headers: { Accept: "image/*" },
        redirect: "follow",
      });
      if (!response.ok) continue;
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0];
      if (!contentType.startsWith("image/")) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 20_000 || bytes.byteLength > MAX_BYTES) continue;
      const path = `${folder}/${persisted.length + 1}.${extensionFor(contentType)}`;
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType, upsert: true, cacheControl: "31536000" });
      if (!error) persisted.push(`/api/public/package-hotel-photo/${path}`);
    } catch {
      // Tenta o próximo resultado da busca.
    }
  }

  return persisted;
}