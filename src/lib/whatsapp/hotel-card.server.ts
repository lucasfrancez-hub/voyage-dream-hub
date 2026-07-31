/**
 * Gera a arte (PNG) do cartão de hotel e devolve a URL pública.
 * Fotografa a rota /api/public/hotel-card no Browserless e guarda no storage.
 * SERVER-ONLY.
 */
import type { HotelCardData } from "@/lib/hotel-card/card-html";

const PUBLIC_BASE = "https://pedidos.viaair.tur.br";
const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
const BUCKET = "broadcast-media";

function encodeData(data: HotelCardData): string {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}

export function hotelCardPreviewUrl(data: HotelCardData, base = PUBLIC_BASE): string {
  return `${base}/api/public/hotel-card?d=${encodeData(data)}`;
}

async function screenshotCard(url: string): Promise<Uint8Array> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");
  const res = await fetch(`${BROWSERLESS_BASE}/screenshot?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "load", timeout: 15000 },
      viewport: { width: 900, height: 600, deviceScaleFactor: 2 },
      selector: ".card",
      options: { type: "png", omitBackground: true },
    }),
  });
  if (!res.ok) throw new Error(`Browserless ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Gera a arte do hotel e devolve a URL pública do PNG. */
export async function renderHotelCardImage(data: HotelCardData): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bytes = await screenshotCard(hotelCardPreviewUrl(data));
  const path = `hotel-cards/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Falha ao salvar a arte: ${error.message}`);
  return `${PUBLIC_BASE}/api/public/broadcast-media/${path}`;
}
