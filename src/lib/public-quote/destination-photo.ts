/**
 * Foto do destino para o hero do orçamento público.
 * Sempre varia conforme o destino: busca a imagem principal do destino na
 * Wikipédia (pt, com fallback en). Nunca reutiliza foto de outro destino.
 */

const cache = new Map<string, string | null>();

function limparDestino(destino: string): string {
  return destino
    .replace(/\s*[-–—/|]\s*.*$/, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\b(aeroporto|internacional|brasil|br)\b/gi, "")
    .trim();
}

async function buscarWiki(lang: string, termo: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo)}`,
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const src: string | undefined = j?.originalimage?.source || j?.thumbnail?.source;
    if (!src) return null;
    if (/\.svg($|\?)/i.test(src)) return null;
    return src.replace(/\/\d+px-/, "/1600px-");
  } catch {
    return null;
  }
}

export async function fotoDoDestino(destino?: string | null): Promise<string | null> {
  const base = limparDestino(destino ?? "");
  if (!base) return null;
  if (cache.has(base)) return cache.get(base) ?? null;

  let url =
    (await buscarWiki("pt", base)) ??
    (await buscarWiki("pt", `${base} (cidade)`)) ??
    (await buscarWiki("en", base));

  cache.set(base, url);
  return url;
}
