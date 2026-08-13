/**
 * Fotografia REAL do destino para o fundo do card (nunca IA generativa).
 * Fontes: Pexels e Unsplash — alta resolução, sem marca-d'água e sem texto.
 * SERVER-ONLY.
 *
 * Relevância: as consultas são montadas em inglês (as duas APIs indexam em
 * inglês) e os resultados passam por um filtro que exige o nome da cidade
 * (ou um marco conhecido dela) na descrição/tags da foto. Sem isso o Pexels
 * devolve "qualquer cidade genérica" quando o termo é em português.
 */
export type DestinationPhoto = {
  url: string;
  thumb: string;
  author: string;
  source: "Pexels" | "Unsplash";
  /** Texto usado para conferir relevância (descrição/tags). */
  context?: string;
};

const RUIM = /(map|mapa|flag|bandeira|logo|placa|sign|illustration|vector|3d render|clipart)/i;

/** Normaliza para comparação (sem acento, minúsculo). */
function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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
        context: [p?.alt, p?.url].filter(Boolean).join(" "),
      }))
      .filter((p: DestinationPhoto) => p.url && !RUIM.test(p.context ?? ""));
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
        context: [
          p?.description,
          p?.alt_description,
          p?.location?.name,
          p?.location?.city,
          p?.location?.country,
          ...(Array.isArray(p?.tags) ? p.tags.map((t: any) => t?.title) : []),
        ]
          .filter(Boolean)
          .join(" "),
      }))
      .filter((p: DestinationPhoto) => p.url && !RUIM.test(p.context ?? ""));
  } catch {
    return [];
  }
}

/** País/apelidos de cidades para tornar a busca inequívoca. */
const CIDADES: Record<string, { país: string; marcos?: string[] }> = {
  orlando: { país: "Florida USA", marcos: ["theme park", "lake eola", "disney"] },
  miami: { país: "Florida USA", marcos: ["south beach", "ocean drive"] },
  "nova york": { país: "New York USA", marcos: ["manhattan", "brooklyn bridge"] },
  "new york": { país: "New York USA", marcos: ["manhattan", "brooklyn bridge"] },
  lisboa: { país: "Lisbon Portugal", marcos: ["alfama", "belem", "tram 28"] },
  porto: { país: "Porto Portugal", marcos: ["douro", "ribeira"] },
  madri: { país: "Madrid Spain", marcos: ["gran via", "plaza mayor"] },
  madrid: { país: "Madrid Spain", marcos: ["gran via", "plaza mayor"] },
  paris: { país: "France", marcos: ["eiffel", "louvre"] },
  roma: { país: "Rome Italy", marcos: ["colosseum", "vatican"] },
  santiago: { país: "Santiago Chile", marcos: ["andes", "costanera"] },
  "buenos aires": { país: "Argentina", marcos: ["obelisco", "caminito"] },
  bariloche: { país: "Argentina", marcos: ["nahuel huapi"] },
  montevideu: { país: "Montevideo Uruguay", marcos: ["rambla"] },
  cancun: { país: "Mexico", marcos: ["caribbean beach"] },
  cancún: { país: "Mexico", marcos: ["caribbean beach"] },
  "cidade do méxico": { país: "Mexico City", marcos: ["zocalo"] },
  bogota: { país: "Colombia" },
  bogotá: { país: "Colombia" },
  lima: { país: "Peru", marcos: ["miraflores"] },
  punta_cana: { país: "Dominican Republic" },
  "punta cana": { país: "Dominican Republic", marcos: ["bavaro beach"] },
  aruba: { país: "Aruba caribbean" },
  curacao: { país: "Curacao caribbean" },
  "curaçao": { país: "Curacao caribbean" },
  panama: { país: "Panama City" },
  "cidade do panamá": { país: "Panama City" },
};

/** Traduz o nome PT → nome usado internacionalmente. */
const PT_EN: Record<string, string> = {
  "nova york": "New York",
  lisboa: "Lisbon",
  madri: "Madrid",
  roma: "Rome",
  montevideu: "Montevideo",
  "cidade do méxico": "Mexico City",
  "cidade do panamá": "Panama City",
  genebra: "Geneva",
  zurique: "Zurich",
  milão: "Milan",
  florença: "Florence",
  veneza: "Venice",
  atenas: "Athens",
  moscou: "Moscow",
  pequim: "Beijing",
  toquio: "Tokyo",
  tóquio: "Tokyo",
};

/**
 * Busca fotos reais do destino. O mesmo arquivo serve Feed e Story — o
 * recorte muda via object-fit: cover, sem esticar a imagem.
 */
export async function searchDestinationPhotos(
  destino: string,
  portrait = true,
): Promise<DestinationPhoto[]> {
  const bruto = destino.trim();
  if (!bruto) return [];

  const chave = norm(bruto);
  const nome = PT_EN[chave] ?? bruto;
  const info = CIDADES[chave];
  const país = info?.país ?? "Brazil";
  const alvo = norm(nome).split(/\s+/).filter((t) => t.length > 2);

  const consultas = [
    `${nome} ${país} skyline`,
    `${nome} ${país} landmark`,
    ...(info?.marcos ?? []).map((m) => `${nome} ${m}`),
    `${nome} city`,
  ];

  const brutos: DestinationPhoto[] = [];
  for (const q of consultas) {
    const [a, b] = await Promise.all([pexels(q, portrait), unsplash(q, portrait)]);
    for (const p of [...a, ...b]) {
      if (!brutos.some((x) => x.url === p.url)) brutos.push(p);
    }
    if (brutos.length >= 40) break;
  }

  // Relevância: foto cuja descrição/tags mencionam a cidade vem primeiro.
  const combina = (p: DestinationPhoto) => {
    const ctx = norm(`${p.context ?? ""} ${p.author}`);
    return alvo.some((t) => ctx.includes(t));
  };
  const relevantes = brutos.filter(combina);
  const resto = brutos.filter((p) => !combina(p));

  return [...relevantes, ...resto].slice(0, 24);
}
