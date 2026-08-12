/**
 * Fotografia REAL do destino para o fundo do card (nunca IA generativa).
 * Fontes: Pexels e Unsplash — alta resolução, sem marca-d'água e sem texto.
 * SERVER-ONLY.
 */
export type DestinationPhoto = {
  url: string;
  thumb: string;
  author: string;
  source: "Pexels" | "Unsplash";
};

const RUIM = /(map|mapa|flag|bandeira|logo|text|placa|sign|illustration|vector|3d render)/i;

async function pexels(query: string, portrait: boolean): Promise<DestinationPhoto[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "24");
    url.searchParams.set("orientation", portrait ? "portrait" : "square");
    url.searchParams.set("size", "large");
    const r = await fetch(url.toString(), { headers: { Authorization: key } });
    if (!r.ok) return [];
    const j = (await r.json()) as any;
    return (Array.isArray(j?.photos) ? j.photos : [])
      .map((p: any) => ({
        url: (p?.src?.large2x as string) || (p?.src?.original as string) || "",
        thumb: (p?.src?.medium as string) || "",
        author: (p?.photographer as string) || "",
        source: "Pexels" as const,
      }))
      .filter((p: DestinationPhoto) => p.url && !RUIM.test(p.author));
  } catch {
    return [];
  }
}

async function unsplash(query: string, portrait: boolean): Promise<DestinationPhoto[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "24");
    url.searchParams.set("orientation", portrait ? "portrait" : "squarish");
    url.searchParams.set("content_filter", "high");
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    });
    if (!r.ok) return [];
    const j = (await r.json()) as any;
    return (Array.isArray(j?.results) ? j.results : [])
      .map((p: any) => ({
        url: (p?.urls?.regular as string) || (p?.urls?.full as string) || "",
        thumb: (p?.urls?.small as string) || "",
        author: (p?.user?.name as string) || "",
        source: "Unsplash" as const,
      }))
      .filter((p: DestinationPhoto) => p.url && !RUIM.test(String(p.author)));
  } catch {
    return [];
  }
}

/**
 * Busca fotos reais do destino. O mesmo arquivo serve Feed e Story — o
 * recorte muda via object-fit: cover, sem esticar a imagem.
 */
export async function searchDestinationPhotos(
  destino: string,
  portrait = true,
): Promise<DestinationPhoto[]> {
  const termo = destino.trim();
  if (!termo) return [];
  const consultas = [`${termo} cidade skyline`, `${termo} ponto turístico`, termo];
  const out: DestinationPhoto[] = [];
  for (const q of consultas) {
    const [a, b] = await Promise.all([pexels(q, portrait), unsplash(q, portrait)]);
    for (const p of [...a, ...b]) {
      if (!out.some((x) => x.url === p.url)) out.push(p);
    }
    if (out.length >= 18) break;
  }
  return out.slice(0, 24);
}
