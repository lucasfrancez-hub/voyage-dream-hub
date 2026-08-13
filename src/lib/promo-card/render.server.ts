/**
 * Fotografa o card aprovado (Feed 1080x1350 / Story 1080x1920) no Browserless
 * e guarda o PNG no storage. SERVER-ONLY.
 */
import type { PromoCardData, PromoCardFormat } from "./card-data";

const PUBLIC_BASE = "https://pedidos.viaair.tur.br";
const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
const BUCKET = "broadcast-media";

export const CARD_SIZES: Record<PromoCardFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

export function encodeCardData(data: PromoCardData): string {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}

export function promoCardPreviewUrl(
  data: PromoCardData,
  format: PromoCardFormat,
  base = PUBLIC_BASE,
): string {
  return `${base}/api/public/promo-card?f=${format}&d=${encodeCardData(data)}`;
}

async function callBrowserless(
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<Uint8Array> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");
  const res = await fetch(`${BROWSERLESS_BASE}/screenshot?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Browserless ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Fotografa a arte. O HTML vai direto no corpo da requisição — não depende do
 * site publicado responder à rota de preview (era essa a causa do
 * "Element not found on page": em produção a URL ainda podia devolver 404).
 * Se por algum motivo o modo HTML falhar, tentamos a URL pública.
 */
async function shot(
  data: PromoCardData,
  format: PromoCardFormat,
  timeoutMs = 35_000,
): Promise<Uint8Array> {
  const { renderPromoCardHtml } = await import("./card-html");
  const { width, height } = CARD_SIZES[format];
  const viewport = { width, height, deviceScaleFactor: 1 };
  const options = { type: "png" as const, captureBeyondViewport: false };
  const html = renderPromoCardHtml(data, format, PUBLIC_BASE);

  try {
    return await callBrowserless(
      {
        html,
        viewport,
        options,
        waitForSelector: { selector: ".frame", timeout: 15_000 },
        waitForTimeout: 1200,
        selector: ".frame",
      },
      timeoutMs,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      return await callBrowserless(
        {
          url: promoCardPreviewUrl(data, format),
          gotoOptions: { waitUntil: "networkidle2", timeout: 20_000 },
          viewport,
          options,
          waitForSelector: { selector: ".frame", timeout: 15_000 },
          selector: ".frame",
        },
        timeoutMs,
      );
    } catch {
      throw new Error(msg);
    }
  }
}

/** Gera a arte e devolve a URL pública do PNG (1080x1350 ou 1080x1920). */
export async function renderPromoCardAsset(
  data: PromoCardData,
  format: PromoCardFormat,
): Promise<{ url: string; filename: string; width: number; height: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bytes = await shot(data, format);
  if (bytes.byteLength < 1000) throw new Error("Captura vazia da arte");

  const filename = `${format}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const path = `promo-cards/${filename}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Falha ao salvar a arte: ${error.message}`);
  return {
    url: `${PUBLIC_BASE}/api/public/broadcast-media/${path}`,
    filename,
    ...CARD_SIZES[format],
  };
}
