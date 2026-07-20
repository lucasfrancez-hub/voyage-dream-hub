import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão");
}

export const generatePackageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ brief: z.string().min(2).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const system = `Você é copywriter da agência de viagens VIA AIR. Escreva um RESUMO CURTO e envolvente para um pacote turístico, em português do Brasil.
Regras:
- 2 a 3 frases, no máximo 350 caracteres.
- Tom aspiracional, elegante, sem exageros nem clichês ("paraíso", "imperdível", "único").
- Sem emojis, sem hashtags, sem markdown, sem aspas.
- Fale do destino, atmosfera, experiências marcantes. Não invente preços, datas, hotel ou companhia aérea.
- Responda APENAS com o texto final do resumo.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.brief },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Falha IA (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as any;
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("IA não retornou texto");
    return { text };
  });

// Busca de imagens livres — prioriza fotos do artigo da Wikipédia do destino
// (garante que "Fortaleza" = cidade do Ceará, não qualquer forte pelo mundo),
// complementa com Openverse.
type CoverImage = {
  thumb: string;
  url: string;
  title: string;
  source: string;
  author: string;
};

const UA = "VIA-AIR/1.0 (packages cover picker; contato@viaair.tur.br)";

// Resolve o termo para o título canônico de artigo (Wikipédia PT → EN).
async function resolveArticle(query: string): Promise<{ lang: "pt" | "en"; title: string } | null> {
  for (const lang of ["pt", "en"] as const) {
    try {
      const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
      u.searchParams.set("action", "query");
      u.searchParams.set("format", "json");
      u.searchParams.set("origin", "*");
      u.searchParams.set("list", "search");
      u.searchParams.set("srsearch", query);
      u.searchParams.set("srlimit", "1");
      u.searchParams.set("srnamespace", "0");
      const r = await fetch(u.toString(), { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const j = (await r.json()) as any;
      const hit = j?.query?.search?.[0]?.title;
      if (hit) return { lang, title: hit };
    } catch {}
  }
  return null;
}

// Puxa imagens listadas no artigo da Wikipédia do destino.
async function fetchWikipediaArticleImages(query: string): Promise<CoverImage[]> {
  const art = await resolveArticle(query);
  if (!art) return [];
  try {
    const u = `https://${art.lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(art.title)}`;
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    if (!r.ok) return [];
    const j = (await r.json()) as any;
    const items = Array.isArray(j?.items) ? j.items : [];
    const files: string[] = [];
    for (const it of items) {
      if (it?.type !== "image") continue;
      const title = String(it?.title || "");
      if (!title) continue;
      if (/\.svg$/i.test(title)) continue;
      if (/bandeira|brasão|coat[_ ]of[_ ]arms|flag|logo|mapa|map|location|localiza/i.test(title)) continue;
      files.push(title.replace(/^Ficheiro:|^Arquivo:/, "File:"));
      if (files.length >= 20) break;
    }
    if (!files.length) return [];

    const cu = new URL("https://commons.wikimedia.org/w/api.php");
    cu.searchParams.set("action", "query");
    cu.searchParams.set("format", "json");
    cu.searchParams.set("origin", "*");
    cu.searchParams.set("titles", files.join("|"));
    cu.searchParams.set("prop", "imageinfo");
    cu.searchParams.set("iiprop", "url|extmetadata|size|mime");
    cu.searchParams.set("iiurlwidth", "1200");
    const cr = await fetch(cu.toString(), { headers: { "User-Agent": UA } });
    if (!cr.ok) return [];
    const cj = (await cr.json()) as any;
    const pages = cj?.query?.pages ? Object.values(cj.query.pages) : [];
    const out: CoverImage[] = [];
    const orderIdx = new Map(files.map((f, i) => [f, i]));
    const sorted = (pages as any[]).sort(
      (a, b) => (orderIdx.get(a.title) ?? 99) - (orderIdx.get(b.title) ?? 99),
    );
    for (const p of sorted) {
      const info = p?.imageinfo?.[0];
      if (!info) continue;
      const mime = String(info.mime || "");
      if (!mime.startsWith("image/") || mime.includes("svg")) continue;
      const w = Number(info.thumbwidth || info.width || 0);
      const h = Number(info.thumbheight || info.height || 0);
      if (h > w * 1.1) continue;
      const meta = info.extmetadata || {};
      out.push({
        thumb: info.thumburl || info.url,
        url: info.url,
        title: String(p.title || "").replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
        source: `Wikipédia · ${art.title}`,
        author: String(meta?.Artist?.value || "").replace(/<[^>]+>/g, "").trim(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchOpenverse(query: string): Promise<CoverImage[]> {
  try {
    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", query);
    url.searchParams.set("page_size", "18");
    url.searchParams.set("aspect_ratio", "wide");
    url.searchParams.set("size", "large");
    url.searchParams.set("license_type", "commercial");
    url.searchParams.set("mature", "false");
    const resp = await fetch(url.toString(), { headers: { "User-Agent": UA } });
    if (!resp.ok) return [];
    const json = (await resp.json()) as any;
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .map((r: any) => ({
        thumb: (r?.thumbnail as string) || (r?.url as string) || "",
        url: (r?.url as string) || "",
        title: (r?.title as string) || "",
        source: "Openverse",
        author: (r?.creator as string) || "",
      }))
      .filter((x: CoverImage) => !!x.url);
  } catch {
    return [];
  }
}

export const searchCoverImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ query: z.string().min(2).max(120) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const base = data.query.trim();
    const [wiki, ov] = await Promise.all([
      fetchWikipediaArticleImages(base).catch(() => [] as CoverImage[]),
      fetchOpenverse(`${base} city travel`).catch(() => [] as CoverImage[]),
    ]);

    const seen = new Set<string>();
    const images: CoverImage[] = [];
    for (const src of [...wiki, ...ov]) {
      if (!src.url || seen.has(src.url)) continue;
      seen.add(src.url);
      images.push(src);
    }
    return { images: images.slice(0, 30) };
  });

// Extrai dados de voo de um print (screenshot) via IA visão (Gemini).
// Retorna FlightInfo compatível com o editor de pacotes.
export const extractFlightFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        image_base64: z.string().min(100),
        mime_type: z.string().default("image/png"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const system = `Você é um extrator de dados de voos a partir de screenshots de sistemas GDS / motores de reserva (Sabre, Amadeus, LATAM Trade, Skyteam, etc).
Analise a imagem e devolva APENAS um JSON válido, sem markdown, sem comentários, com esta forma exata:
{
  "airline": "nome da cia (ex.: LATAM, GOL, Azul)",
  "flight_number": "número do primeiro voo (ex.: LA3531)",
  "from_iata": "IATA da origem do primeiro trecho",
  "from_city": "cidade da origem (só nome, sem estado)",
  "to_iata": "IATA do destino do último trecho",
  "to_city": "cidade do destino final",
  "depart_at": "HH:MM do primeiro trecho (24h)",
  "arrive_at": "HH:MM da chegada no destino final (24h)",
  "duration": "duração total (ex.: 05h55)",
  "cabin_class": "Econômica | Premium Economy | Executiva | Primeira",
  "fare_class": "código da tarifa se visível (ex.: Q, LIGHT)",
  "carry_on": true|false,
  "checked_bag": true|false,
  "personal_item": true|false,
  "segments": [
    {
      "airline": "...",
      "flight_number": "LA3531",
      "from_iata": "MGF",
      "from_city": "Maringá",
      "to_iata": "GRU",
      "to_city": "São Paulo",
      "depart_at": "07:15",
      "arrive_at": "08:40",
      "duration": "01h25",
      "layover": "02h35 em São Paulo"
    }
  ]
}
Regras:
- Retorne SÓ o JSON, começando com { e terminando com }.
- Se um campo não estiver visível, omita-o (não invente).
- carry_on/checked_bag/personal_item: infira pelos ícones de bagagem (mão, despachada, pessoal). Se ícone aparece sem risco/cinza, é true.
- Cidade sempre em português quando comum (São Paulo, não Sao Paulo).
- Se houver várias paradas, preencha "segments" na ordem; "layover" só nos intermediários.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados deste voo:" },
              {
                type: "image_url",
                image_url: { url: `data:${data.mime_type};base64,${data.image_base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Falha IA (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as any;
    let text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("IA não retornou JSON");
    let parsed: any;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new Error("JSON inválido retornado pela IA");
    }
    return { flight: parsed };
  });
