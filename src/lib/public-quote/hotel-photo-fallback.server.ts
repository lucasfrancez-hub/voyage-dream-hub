const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
const BUCKET = "package-hotel-photos";
const MAX_PHOTOS = 5;
const MAX_BYTES = 12 * 1024 * 1024;

function acceptableUrl(value: unknown): value is string {
  if (typeof value !== "string" || !/^https:\/\//i.test(value)) return false;
  return !/(logo|favicon|sprite|avatar|icon|badge|map|\.svg(?:\?|$))/i.test(value);
}

function extensionFor(contentType: string, url: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("avif")) return "avif";
  const match = new URL(url).pathname.match(/\.(jpe?g|png|webp|avif)$/i);
  return match?.[1]?.toLowerCase().replace("jpeg", "jpg") ?? "jpg";
}

async function searchWebImages(hotelName: string, city: string | null): Promise<string[]> {
  const token = process.env["BROWSERLESS_TOKEN"];
  if (!token) return [];

  const query = `\"${hotelName}\" ${city ?? ""} hotel fotos`.trim();
  const params = new URLSearchParams({ token, timeout: "35000" });
  const code = `
    export default async ({ page, context }) => {
      await page.goto('https://www.bing.com/images/search?q=' + encodeURIComponent(context.query), {
        waitUntil: 'domcontentloaded', timeout: 25000
      });
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const urls = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('a.iusc')) {
          try {
            const meta = JSON.parse(el.getAttribute('m') || '{}');
            if (meta.murl) out.push(meta.murl);
          } catch {}
        }
        return out;
      });
      return { data: urls.slice(0, 30) };
    };
  `;

  try {
    const response = await fetch(`${BROWSERLESS_BASE}/function?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context: { query } }),
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { data?: unknown[] };
    return (json.data ?? []).filter(acceptableUrl);
  } catch {
    return [];
  }
}

/** Busca fotos do hotel na web e salva cópias estáveis no armazenamento do projeto. */
export async function recoverHotelPhotos(
  hotelName: string,
  city: string | null,
): Promise<string[]> {
  const candidates = await searchWebImages(hotelName, city);
  if (!candidates.length) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const folder = crypto.randomUUID();
  const persisted: string[] = [];

  for (const url of candidates) {
    if (persisted.length >= MAX_PHOTOS) break;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; ViaAirHotelPhotos/1.0; +https://viaair.tur.br)",
        },
        redirect: "follow",
      });
      if (!response.ok) continue;
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0];
      if (!contentType.startsWith("image/")) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 20_000 || bytes.byteLength > MAX_BYTES) continue;
      const path = `${folder}/${persisted.length + 1}.${extensionFor(contentType, url)}`;
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