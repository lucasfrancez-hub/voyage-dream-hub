/**
 * Foto do destino para o hero do orçamento público.
 * Sempre varia conforme o destino: busca a imagem principal do destino na
 * Wikipédia (pt, com fallback en). Nunca reutiliza foto de outro destino.
 */

const cache = new Map<string, string | null>();

import { nomeDestino } from "./destination-name";

function limparDestino(destino: string): string {
  return (nomeDestino(destino) ?? destino)
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

/** Última tentativa: pesquisa na Wikipédia e usa a imagem do 1º resultado. */
async function buscarPorPesquisa(lang: string, termo: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(
        termo,
      )}&prop=pageimages&piprop=original`,
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const pages = j?.query?.pages ? Object.values(j.query.pages) : [];
    const src: string | undefined = (pages[0] as any)?.original?.source;
    if (!src || /\.svg($|\?)/i.test(src)) return null;
    return src;
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
    (await buscarWiki("en", base)) ??
    (await buscarPorPesquisa("pt", base));

  cache.set(base, url);
  return url;
}
