import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeFlightBaggage, normalizePackageFlights } from "@/lib/packages/flight-baggage";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão");
}

function normalizePackageSupplier(value: unknown): string {
  const supplier = String(value ?? "").trim();
  if (!supplier) return "";
  if (/cativa/i.test(supplier)) return "Cativa Operadora";
  if (/via\s*air|via\s*a[eé]rea|voe\s*air|voeair(?:\.com)?|infotera/i.test(supplier)) return "";
  return supplier;
}

export const generatePackageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      brief: z.string().min(2).max(500),
      destination: z.string().max(200).optional(),
      angle: z.string().max(80).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const angles = [
      "praias, mar e orla",
      "gastronomia e vida local",
      "cultura, história e arquitetura",
      "natureza, trilhas e paisagens",
      "vida noturna, bares e música",
      "bairros e passeios imperdíveis",
      "experiências ao ar livre e esportes",
      "artesanato, feiras e tradições",
    ];
    const angle = data.angle || angles[Math.floor(Math.random() * angles.length)];
    const dest = (data.destination || "").trim();

    const system = `Você é copywriter da agência de viagens VIA AIR. Escreva um RESUMO CURTO e envolvente sobre o DESTINO de um pacote turístico, em português do Brasil.
Regras rígidas:
- 2 a 3 frases, no máximo 350 caracteres.
- Fale ESPECIFICAMENTE sobre o lugar: cite pelo menos 2 elementos concretos e reconhecíveis do destino (praias, bairros, pratos típicos, pontos históricos, natureza, cultura local). Nada genérico.
- PROIBIDO usar frases-clichê como "central de espera para suas férias", "destino perfeito", "experiência inesquecível", "paraíso", "único", "imperdível", "escapada dos sonhos", "cenário deslumbrante", "encanta a todos".
- PROIBIDO falar do pacote, do preço, de hotel, de companhia aérea, de datas ou da agência.
- Foco autoral: descreva o LUGAR como um guia local descreveria — concreto, sensorial, específico.
- Ângulo desta versão: ${angle}. Priorize esse recorte, mas mantenha a fluidez.
- Sem emojis, sem hashtags, sem markdown, sem aspas.
- Responda APENAS com o texto final, sem rótulos.`;

    const userMsg = dest
      ? `Destino: ${dest}\nBriefing/contexto: ${data.brief}\nEscreva o resumo sobre ${dest}, com foco em ${angle}.`
      : data.brief;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        temperature: 1.05,
        top_p: 0.95,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
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


export const generatePackageTagline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ destination: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const system = `Você é copywriter da VIA AIR. Crie UMA frase MUITO CURTA e elegante para uma arte de post sobre o destino "${data.destination}".
Regras:
- MÁXIMO 4 PALAVRAS. Nunca mais que isso.
- Apenas UMA linha, sem quebras.
- Sem ponto final, sem emojis, sem hashtags, sem aspas, sem markdown.
- NÃO cite preços, hotel, datas, agência ou pacote.
- Deve remeter ao lugar (paisagem/clima/vibe).
Exemplos:
Porto Seguro: "Paraíso te espera"
Gramado: "Charme da Serra"
Bariloche: "Neve e paisagens"
Cancún: "Águas cristalinas te chamam"
Responda apenas com a frase.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        temperature: 1.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Destino: ${data.destination}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`Falha IA (${resp.status})`);
    const json = (await resp.json()) as any;
    const raw = String(json?.choices?.[0]?.message?.content ?? "").trim();
    let text = raw.replace(/^["'“”]+|["'“”]+$/g, "").split("\n")[0].trim();
    text = text.replace(/[.!?]+$/g, "").trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 4) text = words.slice(0, 4).join(" ");
    return { text: text || `Descubra ${data.destination}` };
  });





// Busca de imagens livres — combina múltiplas fontes de alta qualidade:
// 1) Categoria do destino no Wikimedia Commons (galeria curada com centenas
//    de fotos: pontos turísticos, praias, arquitetura). Usa Wikidata (P373)
//    para achar a categoria correta a partir do artigo da Wikipédia.
// 2) Fotos listadas no próprio artigo da Wikipédia.
// 3) Openverse como complemento e para paginação.
type CoverImage = {
  thumb: string;
  url: string;
  title: string;
  source: string;
  author: string;
};

const UA = "VIA-AIR/1.0 (packages cover picker; contato@viaair.tur.br)";

// Bloqueia imagens que não são fotos do destino.
const BAD_TITLE = /bandeira|brasão|coat[_ ]of[_ ]arms|flag|logo|mapa|map\b|location|localiza|seal[_ ]of|escudo|orthographic|topograph|climograph|graph|chart|diagram|elevation|satellite|nasa|landsat|blank|svg|icon/i;

async function fetchJson(u: string) {
  const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

async function resolveDestination(query: string): Promise<{
  lang: "pt" | "en";
  title: string;
  commonsCategory: string | null;
} | null> {
  for (const lang of ["pt", "en"] as const) {
    const su = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    su.search = new URLSearchParams({
      action: "query", format: "json", origin: "*",
      list: "search", srsearch: query, srlimit: "1", srnamespace: "0",
    }).toString();
    const sj: any = await fetchJson(su.toString());
    const title = sj?.query?.search?.[0]?.title;
    if (!title) continue;

    const pu = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    pu.search = new URLSearchParams({
      action: "query", format: "json", origin: "*",
      titles: title, prop: "pageprops",
    }).toString();
    const pj: any = await fetchJson(pu.toString());
    const pages = pj?.query?.pages ? Object.values(pj.query.pages) : [];
    const qid = (pages[0] as any)?.pageprops?.wikibase_item as string | undefined;

    let commonsCategory: string | null = null;
    if (qid) {
      const wj: any = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
      const p373 = wj?.entities?.[qid]?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
      if (typeof p373 === "string" && p373.length > 0) commonsCategory = p373;
    }
    return { lang, title, commonsCategory };
  }
  return null;
}

async function loadImageInfos(titles: string[]): Promise<CoverImage[]> {
  const out: CoverImage[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    u.search = new URLSearchParams({
      action: "query", format: "json", origin: "*",
      titles: batch.join("|"),
      prop: "imageinfo",
      iiprop: "url|extmetadata|size|mime",
      iiurlwidth: "1600",
    }).toString();
    const j: any = await fetchJson(u.toString());
    const pages = j?.query?.pages ? Object.values(j.query.pages) : [];
    const order = new Map(batch.map((t, idx) => [t, idx]));
    const sorted = (pages as any[]).sort(
      (a, b) => (order.get(a.title) ?? 99) - (order.get(b.title) ?? 99),
    );
    for (const p of sorted) {
      const info = p?.imageinfo?.[0];
      if (!info) continue;
      const mime = String(info.mime || "");
      if (!mime.startsWith("image/") || mime.includes("svg")) continue;
      const w = Number(info.thumbwidth || info.width || 0);
      const h = Number(info.thumbheight || info.height || 0);
      if (!w || !h) continue;
      if (h > w * 1.15) continue;
      if (Number(info.width || 0) < 900) continue;
      const title = String(p.title || "");
      if (BAD_TITLE.test(title)) continue;
      const meta = info.extmetadata || {};
      out.push({
        thumb: info.thumburl || info.url,
        url: info.url,
        title: title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
        source: "Wikimedia Commons",
        author: String(meta?.Artist?.value || "").replace(/<[^>]+>/g, "").trim().slice(0, 80),
      });
    }
  }
  return out;
}

async function listCategoryFiles(category: string, limit = 250): Promise<string[]> {
  const cat = category.startsWith("Category:") ? category : `Category:${category}`;
  const files: string[] = [];

  async function pull(catTitle: string, max: number) {
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    u.search = new URLSearchParams({
      action: "query", format: "json", origin: "*",
      list: "categorymembers",
      cmtitle: catTitle, cmtype: "file",
      cmlimit: String(max),
    }).toString();
    const j: any = await fetchJson(u.toString());
    for (const m of j?.query?.categorymembers ?? []) {
      if (typeof m?.title === "string") files.push(m.title);
    }
  }

  await pull(cat, limit);

  if (files.length < limit) {
    const su = new URL("https://commons.wikimedia.org/w/api.php");
    su.search = new URLSearchParams({
      action: "query", format: "json", origin: "*",
      list: "categorymembers",
      cmtitle: cat, cmtype: "subcat", cmlimit: "30",
    }).toString();
    const sj: any = await fetchJson(su.toString());
    const subs: string[] = (sj?.query?.categorymembers ?? [])
      .map((m: any) => String(m?.title || ""))
      .filter((t: string) =>
        /beach|praia|coast|litoral|landmark|tourism|turismo|architecture|arquitetura|building|edif|view|paisagem|landscape|monument|park|parque|square|praça|church|igreja|cathedral|catedral|hotel|street|rua|avenid|centro|downtown|skyline/i.test(t),
      )
      .slice(0, 10);
    for (const s of subs) {
      if (files.length >= limit) break;
      await pull(s, 50);
    }
  }
  return Array.from(new Set(files));
}

async function fetchArticleImages(lang: "pt" | "en", title: string): Promise<string[]> {
  const u = `https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`;
  const j: any = await fetchJson(u);
  const items = Array.isArray(j?.items) ? j.items : [];
  const files: string[] = [];
  for (const it of items) {
    if (it?.type !== "image") continue;
    const t = String(it?.title || "").replace(/^Ficheiro:|^Arquivo:/, "File:");
    if (!t || BAD_TITLE.test(t)) continue;
    files.push(t);
  }
  return files;
}

async function fetchOpenverse(query: string, page: number): Promise<CoverImage[]> {
  try {
    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", query);
    url.searchParams.set("page_size", "24");
    url.searchParams.set("page", String(page));
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
      .filter((x: CoverImage) => !!x.url && !BAD_TITLE.test(x.title));
  } catch {
    return [];
  }
}

async function fetchPexels(query: string, page: number): Promise<CoverImage[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "30");
    url.searchParams.set("page", String(page));
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("size", "large");
    const resp = await fetch(url.toString(), { headers: { Authorization: key } });
    if (!resp.ok) return [];
    const json = (await resp.json()) as any;
    const results = Array.isArray(json?.photos) ? json.photos : [];
    return results
      .map((r: any) => ({
        thumb: (r?.src?.medium as string) || (r?.src?.small as string) || "",
        url: (r?.src?.large2x as string) || (r?.src?.large as string) || (r?.src?.original as string) || "",
        title: (r?.alt as string) || query,
        source: "Pexels",
        author: (r?.photographer as string) || "",
      }))
      .filter((x: CoverImage) => !!x.url);
  } catch {
    return [];
  }
}

async function fetchUnsplash(query: string, page: number): Promise<CoverImage[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "30");
    url.searchParams.set("page", String(page));
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as any;
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .map((r: any) => ({
        thumb: (r?.urls?.small as string) || (r?.urls?.thumb as string) || "",
        url: (r?.urls?.regular as string) || (r?.urls?.full as string) || "",
        title: (r?.description as string) || (r?.alt_description as string) || query,
        source: "Unsplash",
        author: (r?.user?.name as string) || "",
      }))
      .filter((x: CoverImage) => !!x.url);
  } catch {
    return [];
  }
}


export const searchCoverImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      query: z.string().min(2).max(120),
      page: z.number().int().min(1).max(10).default(1),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const base = data.query.trim();
    const page = data.page;

    let commonsImgs: CoverImage[] = [];
    let articleImgs: CoverImage[] = [];
    let sourceLabel = "Pexels + Unsplash + Wikimedia";

    if (page === 1) {
      const dest = await resolveDestination(base).catch(() => null);
      if (dest) {
        sourceLabel = `Pexels · Unsplash · Wikimedia (${dest.title})`;
        const [catFiles, artFiles] = await Promise.all([
          dest.commonsCategory
            ? listCategoryFiles(dest.commonsCategory, 250).catch(() => [])
            : Promise.resolve([]),
          fetchArticleImages(dest.lang, dest.title).catch(() => []),
        ]);
        const allFiles = Array.from(new Set([...artFiles, ...catFiles])).slice(0, 150);
        const infos = await loadImageInfos(allFiles).catch(() => []);
        const artSet = new Set(artFiles);
        articleImgs = infos.filter((i) => artSet.has(`File:${i.title}`) || artSet.has(i.title));
        commonsImgs = infos.filter((i) => !articleImgs.includes(i));
      }
    }

    const [px, un, ov] = await Promise.all([
      fetchPexels(base, page).catch(() => [] as CoverImage[]),
      fetchUnsplash(base, page).catch(() => [] as CoverImage[]),
      fetchOpenverse(base, page).catch(() => [] as CoverImage[]),
    ]);

    const seen = new Set<string>();
    const images: CoverImage[] = [];
    // Prioridade: Pexels/Unsplash (fotos profissionais) → Wikimedia → Openverse
    for (const src of [...px, ...un, ...articleImgs, ...commonsImgs, ...ov]) {
      if (!src.url || seen.has(src.url)) continue;
      seen.add(src.url);
      images.push(src);
    }

    return {
      images: images.slice(0, 120),
      page,
      hasMore: px.length >= 20 || un.length >= 20 || ov.length >= 20,
      sourceLabel,
    };
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
  "flight_number": "número do primeiro voo — SÓ DÍGITOS, sem código de cia e sem hífen (ex.: '3531', '1137')",
  "from_iata": "IATA da origem do primeiro trecho",
  "from_city": "cidade da origem (só nome, sem estado)",
  "to_iata": "IATA do destino do último trecho",
  "to_city": "cidade do destino final",
  "depart_at": "ISO local YYYY-MM-DDTHH:MM do primeiro trecho (ex.: '2026-11-06T08:20')",
  "arrive_at": "ISO local YYYY-MM-DDTHH:MM da chegada no destino final",
  "duration": "duração total (ex.: 05h55)",
  "cabin_class": "Econômica | Premium Economy | Executiva | Primeira",
  "fare_class": "código da tarifa se visível (ex.: Q, LIGHT, BLOQ)",
  "carry_on": true,
  "checked_bag": true,
  "personal_item": true,
  "segments": [
    {
      "airline": "GOL",
      "flight_number": "1137",
      "from_iata": "MGF",
      "from_city": "Maringá",
      "to_iata": "CGH",
      "to_city": "São Paulo",
      "depart_at": "2026-11-06T08:20",
      "arrive_at": "2026-11-06T09:45",
      "duration": "01h25",
      "layover": "01h20 em São Paulo"
    }
  ]
}
Regras:
- Retorne SÓ o JSON, começando com { e terminando com }.
- flight_number: SOMENTE DÍGITOS, EXATAMENTE como aparecem depois do código da cia. Ex.: "G3 - 1137" → "1137" (quatro dígitos, NÃO "7"). "LA 3531" → "3531". "AD  4022" → "4022". SEMPRE preserve TODOS os dígitos (tipicamente 3 ou 4). NUNCA devolva só o último dígito. NUNCA inclua a sigla da cia nem hífen.
- depart_at / arrive_at: SEMPRE em ISO local "YYYY-MM-DDTHH:MM". Combine a DATA visível na imagem (ex.: "Sex 06 Nov", "sex 6 nov 2026", "6 de novembro de 2026") com o horário HH:MM. Se o ano não estiver explícito, use o ano do cabeçalho/contexto (ex.: "IDA - sex 6 nov 2026"). Meses PT: jan=01, fev=02, mar=03, abr=04, mai=05, jun=06, jul=07, ago=08, set=09, out=10, nov=11, dez=12.
- Cada segmento DEVE ter depart_at e arrive_at completos (data + hora). Se o próximo trecho passa da meia-noite, incremente a data.
- Se um campo realmente não estiver visível, omita-o (não invente).
- BAGAGEM (analise com muita atenção): personal_item e carry_on devem ser true por padrão nos aéreos destes pacotes. checked_bag = true com ícone ativo/colorido, "1 bagagem", "1 peça", "1 PC" ou "23 kg"; ícone cinza/riscado, "0 PC" ou "sem bagagem despachada" = false. Se não houver despachada, fare_class="LIGHT". Se houver despachada, fare_class="STANDARD" (a menos que o print mostre outro código explícito como FULL/PLUS/TOP/BLOQ). NUNCA deixe fare_class vazio.
- Cidade sempre em português quando comum (São Paulo, não Sao Paulo).
- Se houver várias paradas, preencha "segments" na ordem; "layover" só nos intermediários (ex.: "01h20 em São Paulo").
- Antes de finalizar, RELEIA a imagem e confirme: (a) números de voo só com dígitos, todos presentes; (b) TODOS os depart_at/arrive_at com data completa YYYY-MM-DDTHH:MM.`;


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
              {
                type: "text",
                text: "Extraia os dados deste voo. IMPORTANTE: os horários de partida e chegada (HH:MM) aparecem em destaque no print, geralmente em fonte grande ao lado de cada aeroporto/IATA — leia CADA UM e devolva ISO completo YYYY-MM-DDTHH:MM combinando com a data do cabeçalho. Confira dígito a dígito os números de voo (todos os 4 dígitos) antes de devolver.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${data.mime_type};base64,${data.image_base64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
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

    // Saneamento defensivo: garantir flight_number só-dígitos (remove prefixo cia + hífen)
    const cleanNo = (v: any): string | undefined => {
      if (v == null) return undefined;
      const s = String(v).trim();
      const digits = s.replace(/[^0-9]/g, "");
      return digits || undefined;
    };
    if (parsed && typeof parsed === "object") {
      if (parsed.flight_number !== undefined) parsed.flight_number = cleanNo(parsed.flight_number);
      if (Array.isArray(parsed.segments)) {
        parsed.segments = parsed.segments.map((s: any) => ({
          ...s,
          flight_number: s?.flight_number !== undefined ? cleanNo(s.flight_number) : s?.flight_number,
        }));
      }
      parsed = normalizeFlightBaggage(parsed);
    }

    return { flight: parsed };
  });


// Extrai um pacote completo a partir de um documento (PDF ou imagem):
// orçamento, voucher, itinerário. Retorna partial PackageRow com datas,
// destino, hotel, refeição, valores e voos de ida/volta.
export const extractPackageFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        file_base64: z.string().min(100),
        mime_type: z.string().default("application/pdf"),
        filename: z.string().default("orcamento.pdf"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const system = `Você extrai dados de PACOTES TURÍSTICOS a partir de orçamentos, vouchers e itinerários (PDF ou imagem) de operadoras (Visual Turismo, CVC, Azul Viagens, Flytour, Nascimento, etc).
Devolva APENAS um JSON válido (sem markdown) nesta forma exata (omita campos que não estiverem no documento — NÃO invente):
{
  "destination": "Cidade principal do destino (ex.: Porto Seguro)",
  "origin": "Cidade de origem (ex.: Maringá)",
  "going_date": "YYYY-MM-DD (data de ida)",
  "return_date": "YYYY-MM-DD (data de volta)",
  "nights": 6,
  "base_occupancy": 2,
  "price_per_person": 2705.89,
  "taxes": 167.50,
  "hotel_name": "BOSQUE DO PORTO PRAIA HOTEL",
  "hotel_stars": 4,
  "meal_plan": "Café da manhã | Meia pensão | Pensão completa | All inclusive | \"\" (vazio se não mencionado)",
  "room_type": "Standard | Superior | Luxo | ...",
  "room_category": "Standard",
  "bed_type": "Casal | Solteiro | Duplo",
  "includes": ["Hospedagem", "Aéreo", "Traslados", "Passeios"],
  "supplier_name": "Visual Turismo",
  "services": {
    "seguro": {
      "enabled": true,
      "cobertura": "12.000",
      "moeda": "USD"
    },
    "cancelamento": {
      "enabled": true,
      "cobertura": "5.000",
      "moeda": "BRL"
    },
    "transfer": { "enabled": true, "sentido": "in_out" },
    "city_tour": { "enabled": false, "detalhe": "" },
    "outros": ["Assistência 24h"]
  },
  "baggage_scope": "shared | per_flight",
  "outbound_flight": {
    "airline": "GOL",
    "flight_number": "1137",
    "from_iata": "MGF",
    "from_city": "Maringá",
    "to_iata": "BPS",
    "to_city": "Porto Seguro",
    "depart_at": "2026-11-06T08:20",
    "arrive_at": "2026-11-06T13:05",
    "duration": "04h45",
    "cabin_class": "Econômica",
    "carry_on": true,
    "checked_bag": false,
    "personal_item": true,
    "segments": [
      {
        "airline": "GOL",
        "flight_number": "1137",
        "from_iata": "MGF",
        "from_city": "Maringá",
        "to_iata": "CGH",
        "to_city": "São Paulo",
        "depart_at": "2026-11-06T08:20",
        "arrive_at": "2026-11-06T09:45",
        "duration": "01h25",
        "layover": "01h20 em São Paulo"
      },
      {
        "airline": "GOL",
        "flight_number": "1502",
        "from_iata": "CGH",
        "from_city": "São Paulo",
        "to_iata": "BPS",
        "to_city": "Porto Seguro",
        "depart_at": "2026-11-06T11:05",
        "arrive_at": "2026-11-06T13:05",
        "duration": "02h00"
      }
    ]
  },
  "return_flight": { ...mesma estrutura, no sentido inverso }
}
Regras:
- VALORES: pegue o TOTAL COM TAXAS INCLUSAS do documento (ex.: "Total com taxas — R$ 5.579,27") e o VALOR DAS TAXAS informado (ex.: "Taxas R$ 165,50"). price_per_person = TOTAL_COM_TAXAS / base_occupancy. taxes = valor das taxas exatamente como aparece no documento (para demonstrativo/conferência, NÃO zero). Nunca subtraia as taxas do total.
- flight_number: SOMENTE dígitos, todos preservados (ex.: "1137", não "7").
- depart_at/arrive_at: sempre ISO "YYYY-MM-DDTHH:MM". Combine a data do trecho (ex.: "06 nov 2026") com o horário HH:MM.
- Meses PT: jan=01, fev=02, mar=03, abr=04, mai=05, jun=06, jul=07, ago=08, set=09, out=10, nov=11, dez=12.
- Se houver conexões, preencha "segments" na ordem e defina depart_at do voo agregado = do primeiro segmento, arrive_at = do último.
- Cidade em português (São Paulo, não Sao Paulo). from_city/to_city do voo agregado = origem do primeiro trecho / destino final.
- meal_plan: procure ATIVAMENTE. Indicadores BR: "Café da Manhã"/"com café"/"c/ café"/"café incluso"/"ACM"/"APT c/ café" → "Café da manhã"; "Meia Pensão"/"MAP" → "Meia pensão"; "Pensão Completa"/"FAP" → "Pensão completa"; "All Inclusive"/"Tudo Incluso"/"AI" → "All inclusive"; "Sem refeição"/"SC"/"Room Only" → "Sem refeição". "" só se realmente não houver menção.
- BAGAGEM (CRÍTICO — analise CADA voo separadamente, ida e volta podem ter regras diferentes; NÃO copie a bagagem da ida para a volta):
  * baggage_scope é OBRIGATÓRIO: use "shared" quando o documento mostra uma única regra/bloco de bagagem para todo o aéreo de ida e volta; use "per_flight" somente quando mostra regras/blocos separados por direção.
  * Primeiro determine se o documento mostra bagagem separada por voo ou uma única regra comum ao pacote. Se houver blocos separados, analise CADA voo individualmente. Se houver UM ÚNICO bloco/linha de bagagem para o aéreo de ida e volta, aplique essa mesma regra a outbound_flight e return_flight — não marque a volta como false apenas porque o bloco comum apareceu uma vez.
  * personal_item: use true por padrão; confirme também por "item pessoal", "mochila", "personal item", "1 objeto pessoal".
  * carry_on: use true por padrão; confirme também por "bagagem de mão", "10kg", "carry on", ícone de mochila grande/mala pequena ATIVO/colorido.
  * checked_bag: true APENAS com menção explícita a bagagem despachada ("1 bagagem despachada", "23kg", "1 peça 23kg", "1 bag 23kg", ícone de mala grande ATIVO/colorido/preenchido). Ícone cinza/riscado/tachado/com X = false.
  * SEMPRE devolva os três campos (personal_item, carry_on, checked_bag) como true/false — NUNCA omita. Não confunda ausência de um segundo bloco com ausência de bagagem: uma regra comum vale para os dois voos.
  * fare_class: se só houver item pessoal + mão (sem despachada) → "LIGHT". Se houver bagagem despachada → "STANDARD". Se o documento mostrar código explícito diferente (ex.: "FULL", "PLUS", "TOP", "BLOQ", "PROMO", "MAX"), use o código como está. SEMPRE preencha fare_class — nunca deixe em branco.
  * Antes de fechar o JSON, RELEIA o bloco de bagagens de cada voo e confirme dígito a dígito se marcou certo cada um dos três ícones para IDA e para VOLTA.

- hotel_stars: número inteiro de 1 a 5 (conte as estrelas ou pegue a classificação).
- includes: liste os itens da seção "Incluso" do documento.
- supplier_name: identifique a OPERADORA/FORNECEDOR emissor do orçamento. OBRIGATÓRIO inspecionar VISUALMENTE tanto o CABEÇALHO quanto o RODAPÉ de TODAS as páginas (logos, marca d'água, blocos de contato) E TAMBÉM o corpo do texto (cláusulas, termos, produtos como Protec Travel, seguros, flexibilidade). Não decida só pelo cabeçalho — muitas vezes a logo grande do topo é da AGÊNCIA revendedora e a OPERADORA emissora só aparece no rodapé ou no meio do documento. AGÊNCIAS REVENDEDORAS NUNCA SÃO A OPERADORA e devem ser SEMPRE IGNORADAS mesmo quando estampadas grandes como logo no topo/rodapé: "VIA AIR", "Via Air", "Via Aérea", "ViaAérea", "Voe Air", "voeair", "voeair.com", "comercial@voeair.com" — todas são a mesma agência revendedora, JAMAIS use como supplier_name. Plataformas técnicas também não contam: "Infotera", "Powered by Infotera", "Lets", "Hotelbeds" (quando aparecer como marketplace). Sempre prefira o nome que aparecer como OPERADORA/EMISSOR do produto turístico. Regras de marca: "Visual" (losango azul) → "Visual Turismo"; "CVC" → "CVC"; "Azul Viagens" → "Azul Viagens"; "Flytour" → "Flytour"; "Nascimento" → "Nascimento Turismo"; qualquer menção a "Cativa" ou "Cativa Operadora" (mesmo se aparecer apenas dentro do texto de Protec Travel / cláusulas / rodapé fino) → "Cativa Operadora"; "GTA" → "GTA"; "HubTravels" → "HubTravels". Se realmente não encontrar operadora identificável depois de varrer cabeçalho, rodapé e corpo, deixe supplier_name em branco (""), NUNCA use o nome da agência revendedora.
- services.seguro: identifique seguro/assistência de viagem (cobertura MÉDICA). Preencha:
  * cobertura: valor da cobertura MÉDICA por pessoa como número/texto (ex.: "30.000", "40.000").
  * moeda: "BRL" | "USD" | "EUR" — leia o símbolo do documento (R$/US$/€).
  Tabela de auto-preenchimento (quando o plano aparecer no voucher e o valor não estiver explícito):
    - GTA "BRONZE AL" → cobertura "12.000" USD.
    - GTA "PRATA AL" → cobertura "30.000" USD.
    - GTA "OURO AL" → cobertura "60.000" USD.
    - Assist Card AC 35 / AC35 → cobertura "35.000" USD.
    - Assist Card AC 60 / AC60 → cobertura "60.000" USD.
  Se o documento mostrar o valor explícito, use o valor do documento (prevalece sobre a tabela).
- services.cancelamento: bloco SEPARADO do seguro, para a "Cobertura de Cancelamento Involuntário de Viagem" / "Protec Travel" / "Flexibilidade Tarifária". enabled=true quando aparecer no orçamento (na seção "Inclui", "Outros Serviços" ou como item independente). Preencha cobertura (ex.: "8.000", "5.000") e moeda ("BRL"/"USD"/"EUR") a partir do símbolo. NÃO confunda com seguro médico — são serviços distintos e ambos podem estar ativos ao mesmo tempo.
- services.transfer: enabled=true quando mencionar "traslados"/"transfer"/"transporte aeroporto-hotel"/"transfer de chegada e saída"; sentido: "in_out" para ida e volta, "in" só chegada, "out" só saída. Frases como "Transfer grátis" ou "PROMO TRANSFER GRÁTIS" também ativam.
- services.city_tour: enabled=true quando mencionar "city tour"/"passeio panorâmico"/"passeios inclusos"; detalhe = descrição curta.
- services.outros: lista de serviços adicionais explícitos (ex.: "eSIM", "bagagem extra", "assistência 24h"). Se não houver menção clara, deixe enabled=false e outros=[].
- Retorne SÓ o JSON, começando com { e terminando com }.`;

    const userContent: any[] = [
      {
        type: "text",
        text: "Extraia todos os campos do pacote a partir deste documento. Preste atenção especial: datas de ida/volta, valor por pessoa (calcular a partir do total se necessário), hotel, refeição, e AMBOS os voos (ida e volta) com todos os segmentos/conexões.",
      },
    ];

    const isPdf = data.mime_type.includes("pdf");
    if (isPdf) {
      userContent.push({
        type: "file",
        file: {
          filename: data.filename,
          file_data: `data:${data.mime_type};base64,${data.file_base64}`,
        },
      });
    } else {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${data.mime_type};base64,${data.file_base64}` },
      });
    }

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
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
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

    const cleanNo = (v: any): string | undefined => {
      if (v == null) return undefined;
      const digits = String(v).replace(/[^0-9]/g, "");
      return digits || undefined;
    };
    const sanitizeFlight = (f: any) => {
      if (!f || typeof f !== "object") return f;
      if (f.flight_number !== undefined) f.flight_number = cleanNo(f.flight_number);
      if (Array.isArray(f.segments)) {
        f.segments = f.segments.map((s: any) => ({
          ...s,
          flight_number: s?.flight_number !== undefined ? cleanNo(s.flight_number) : s?.flight_number,
        }));
      }
      return f;
    };
    if (parsed && typeof parsed === "object") {
      parsed.outbound_flight = sanitizeFlight(parsed.outbound_flight);
      parsed.return_flight = sanitizeFlight(parsed.return_flight);
      parsed = normalizePackageFlights(parsed);
      if (parsed.hotel_stars != null) {
        const n = Math.round(Number(parsed.hotel_stars));
        parsed.hotel_stars = Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : undefined;
      }

      // A extração geral tende a privilegiar a marca grande do cabeçalho e pode
      // ignorar serviços que aparecem páginas depois. Faz uma leitura curta e
      // dedicada do mesmo arquivo para operadora + extras e usa esse resultado
      // como fonte de verdade para esses campos.
      try {
        const focusedResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3.5-flash",
            messages: [
              {
                role: "system",
                content: `Analise o documento inteiro, inclusive cabeçalhos, rodapés, letras pequenas, cláusulas e páginas de serviços. Extraia SOMENTE a operadora emissora e os serviços incluídos.

VIA AIR, Via Aérea, Voe Air, voeair.com e Infotera são agência/plataforma e NUNCA podem ser supplier_name. Se aparecer "Cativa" em qualquer trecho, inclusive nas cláusulas do Protec Travel, supplier_name deve ser "Cativa Operadora".

Retorne apenas JSON exatamente neste formato:
{"supplier_name":"","services":{"seguro":{"enabled":false,"cobertura":"","moeda":"USD"},"cancelamento":{"enabled":false,"cobertura":"","moeda":"BRL"},"transfer":{"enabled":false,"sentido":"in_out"},"city_tour":{"enabled":false,"detalhe":""},"outros":[]}}

Regras:
- seguro = seguro/assistência médica de viagem; ative mesmo sem valor de cobertura.
- cancelamento = Protec Travel, flexibilidade tarifária ou cobertura de cancelamento involuntário; é separado do seguro. Extraia valor e moeda.
- transfer/traslado de chegada e saída = enabled true e sentido in_out.
- Não invente valores.`,
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Faça a varredura completa e retorne operadora e serviços." },
                  ...userContent.slice(1),
                ],
              },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (focusedResp.ok) {
          const focusedJson = (await focusedResp.json()) as any;
          const focusedText = String(focusedJson?.choices?.[0]?.message?.content ?? "").trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();
          const focused = JSON.parse(focusedText) as any;
          const focusedSupplier = normalizePackageSupplier(focused?.supplier_name);
          if (focusedSupplier) parsed.supplier_name = focusedSupplier;
          if (focused?.services && typeof focused.services === "object") {
            parsed.services = {
              ...(parsed.services && typeof parsed.services === "object" ? parsed.services : {}),
              ...focused.services,
            };
          }
        }
      } catch {
        // A leitura principal continua válida se a etapa focada ficar indisponível.
      }

      parsed.supplier_name = normalizePackageSupplier(parsed.supplier_name);
    }

    return { pkg: parsed };
  });


// Extrai VÁRIOS pacotes de um único PDF/imagem, separados por
// "Orcamento 1", "Orçamento 2", "Orcamento 3"… (padrão Infotera/Visual).
export const extractMultiplePackagesFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        file_base64: z.string().min(100),
        mime_type: z.string().default("application/pdf"),
        filename: z.string().default("orcamentos.pdf"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const isPdf = data.mime_type.includes("pdf");
    const fileBlock = isPdf
      ? {
          type: "file" as const,
          file: { filename: data.filename, file_data: `data:${data.mime_type};base64,${data.file_base64}` },
        }
      : {
          type: "image_url" as const,
          image_url: { url: `data:${data.mime_type};base64,${data.file_base64}` },
        };

    const callGemini = async (systemMsg: string, userText: string, maxTokens = 24000, model = "google/gemini-2.5-flash") => {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: [{ type: "text", text: userText }, fileBlock] },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: maxTokens,
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
      return JSON.parse(text.slice(start, end + 1));
    };

    // Passo 1: contar quantos orçamentos existem no documento
    let totalCount = 0;
    try {
      const countRes = await callGemini(
        `Você conta blocos de orçamento em um documento de operadora turística. Cada bloco começa com um cabeçalho no padrão "Orcamento N:" ou "Orçamento N:" (ex.: "Orcamento 1: 617381", "Orcamento 7: 617387"). Retorne APENAS JSON no formato { "count": <número>, "numbers": [1,2,3,...] } onde "numbers" lista TODOS os N encontrados, em ordem. Se só houver um único orçamento sem cabeçalho numerado, retorne { "count": 1, "numbers": [1] }.`,
        "Conte TODOS os cabeçalhos 'Orcamento N' presentes no documento e liste os números N. Não pule nenhum.",
        4000,
      );
      totalCount = Number(countRes?.count ?? (Array.isArray(countRes?.numbers) ? countRes.numbers.length : 0)) || 0;
    } catch {
      totalCount = 0;
    }

    const extractSystem = `Você extrai MÚLTIPLOS pacotes turísticos de um único documento (PDF ou imagem).
O documento normalmente é um arquivo de operadora (Visual Turismo / Infotera / CVC / Azul Viagens / Flytour) que contém vários orçamentos concatenados.

Cada orçamento começa com um cabeçalho no padrão "Orcamento N: <número>" ou "Orçamento N: <número>" (ex.: "Orcamento 1: 617381", "Orcamento 2: 617381"). Cada bloco tem sua própria hospedagem, datas, valores, ida e volta com conexões — até o próximo cabeçalho "Orcamento (N+1)".

Devolva APENAS um JSON válido (sem markdown):
{ "packages": [ { "index": N, ...pacote N... }, ... ] }

Onde "index" = número do cabeçalho "Orcamento N". A ordem deve ser a mesma do documento. Não invente pacotes.

Cada item segue EXATAMENTE esta estrutura (omita campos ausentes — NÃO invente):
{
  "index": 1,
  "destination": "Porto Seguro",
  "origin": "Maringá",
  "going_date": "YYYY-MM-DD",
  "return_date": "YYYY-MM-DD",
  "nights": 6,
  "base_occupancy": 2,
  "price_per_person": 2705.89,
  "taxes": 167.50,
  "hotel_name": "BOSQUE DO PORTO PRAIA HOTEL",
  "hotel_stars": 4,
  "meal_plan": "Café da manhã",
  "room_type": "Standard",
  "room_category": "Standard",
  "bed_type": "Casal",
  "supplier_name": "Visual Turismo",
  "services": {
    "seguro": { "enabled": true, "cobertura": "12.000", "moeda": "USD" },
    "cancelamento": { "enabled": true, "cobertura": "8.000", "moeda": "BRL" },
    "transfer": { "enabled": true, "sentido": "in_out" },
    "city_tour": { "enabled": false, "detalhe": "" },
    "outros": []
  },
  "baggage_scope": "shared | per_flight",
  "outbound_flight": { "airline":"GOL","flight_number":"1137","from_iata":"MGF","from_city":"Maringá","to_iata":"BPS","to_city":"Porto Seguro","depart_at":"2026-12-21T08:20","arrive_at":"2026-12-21T13:05","duration":"04h45","cabin_class":"Econômica","fare_class":"LIGHT","carry_on":true,"checked_bag":false,"personal_item":true,"segments":[ { "airline":"GOL","flight_number":"1137","from_iata":"MGF","from_city":"Maringá","to_iata":"CGH","to_city":"São Paulo","depart_at":"2026-12-21T08:20","arrive_at":"2026-12-21T09:45","duration":"01h25","layover":"01h20 em São Paulo" }, { "airline":"GOL","flight_number":"1502","from_iata":"CGH","from_city":"São Paulo","to_iata":"BPS","to_city":"Porto Seguro","depart_at":"2026-12-21T11:05","arrive_at":"2026-12-21T13:05","duration":"02h00" } ] },
  "return_flight": { ...mesma estrutura, sentido inverso }
}

Regras (aplicar em CADA pacote):
- VALORES: pegue o TOTAL COM TAXAS INCLUSAS (ex.: "Total com taxas — R$ 7.138,10") e o valor das taxas. price_per_person = TOTAL_COM_TAXAS / base_occupancy. taxes = valor das taxas.
- flight_number: SOMENTE dígitos.
- depart_at / arrive_at: ISO "YYYY-MM-DDTHH:MM".
- Conexões: segments em ordem.
- meal_plan: ACM/APT c/ café/"com café"/"c/ café" → "Café da manhã"; MAP/"Meia Pensão" → "Meia pensão"; FAP/"Pensão Completa" → "Pensão completa"; AI/"All Inclusive"/"Tudo Incluso" → "All inclusive"; SC/"Só hospedagem"/"Room Only" → "Sem refeição". Só use "" se não houver menção.
- BAGAGEM E TARIFA (OBRIGATÓRIO EM outbound_flight E return_flight): sempre devolva personal_item=true e carry_on=true. checked_bag=true quando houver ícone ativo, "1 bagagem", "1 peça", "1 PC" ou "23 kg"; false para ícone riscado/cinza, "0 PC" ou "sem bagagem despachada". Se a informação aparecer UMA VEZ como regra comum do aéreo/pacote, aplique-a tanto à ida quanto à volta. Só trate diferente quando houver blocos claramente separados por direção. fare_class nunca pode ficar vazio: checked_bag=true → "STANDARD"; checked_bag=false → "LIGHT"; preserve outro nome somente quando estiver escrito explicitamente no documento.
- baggage_scope é OBRIGATÓRIO em cada pacote: "shared" quando existe uma única regra/bloco de bagagem para todo o aéreo; "per_flight" somente quando existem blocos separados e claramente associados à ida e à volta.
- hotel_stars: inteiro 1-5.
- supplier_name: examine cabeçalho, rodapé, corpo, cláusulas e páginas de serviços. VIA AIR / Via Aérea / Voe Air / voeair.com são a agência revendedora e Infotera é a plataforma: nunca use esses nomes. Qualquer menção a Cativa, inclusive nas cláusulas do Protec Travel, significa supplier_name = "Cativa Operadora". Se não encontrar operadora, deixe vazio.
- services.seguro: seguro/assistência médica de viagem. enabled=true quando aparecer "Seguro viagem", mesmo sem cobertura explícita. cobertura é o valor médico por pessoa e moeda é BRL/USD/EUR.
- services.cancelamento: serviço separado do seguro. enabled=true para "Cobertura de Cancelamento Involuntário de Viagem", "Protec Travel" ou flexibilidade tarifária; extraia cobertura e moeda.
- services.transfer: enabled=true para transfer/traslado. "chegada e saída", "IN/OUT" ou ida e volta significa sentido="in_out".
- services.city_tour: enabled=true quando houver city tour ou passeio incluído. Outros extras explícitos vão em services.outros.
- Cidade em português.

Retorne SÓ o JSON.`;

    const extractBatch = async (from: number, to: number) => {
      const userText =
        totalCount > 0
          ? `Este documento contém ${totalCount} orçamentos. Extraia APENAS os orçamentos com index de ${from} até ${to} (inclusive), na ordem. Cada item deve ter "index" correspondente ao cabeçalho "Orcamento N". Não pule nenhum e não retorne fora dessa faixa.`
          : `Este documento contém MÚLTIPLOS orçamentos separados por 'Orcamento 1', 'Orcamento 2'… (pode ter 2, 5, 10 ou mais). Extraia TODOS os orçamentos presentes, sem pular nenhum. Cada item deve ter "index" = N do cabeçalho.`;
      const parsed = await callGemini(extractSystem, userText, 24000);
      const arr: any[] = Array.isArray(parsed?.packages)
        ? parsed.packages
        : Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === "object"
            ? [parsed]
            : [];
      return arr;
    };

    // Passo 2: extrair em lotes pequenos (evita timeout 524 do gateway em PDFs grandes)
    const BATCH_SIZE = 2;

    const collected = new Map<number, any>();
    if (totalCount > 0) {
      for (let from = 1; from <= totalCount; from += BATCH_SIZE) {
        const to = Math.min(from + BATCH_SIZE - 1, totalCount);
        const arr = await extractBatch(from, to);
        for (const pkg of arr) {
          if (!pkg || typeof pkg !== "object") continue;
          const idx = Number(pkg.index);
          const key = Number.isFinite(idx) && idx > 0 ? idx : collected.size + 1;
          if (!collected.has(key)) collected.set(key, pkg);
        }
      }
      // Retry para os que faltaram
      const missing: number[] = [];
      for (let i = 1; i <= totalCount; i++) if (!collected.has(i)) missing.push(i);
      for (const i of missing) {
        try {
          const arr = await extractBatch(i, i);
          for (const pkg of arr) {
            if (!pkg || typeof pkg !== "object") continue;
            const idx = Number(pkg.index) || i;
            if (!collected.has(idx)) collected.set(idx, pkg);
          }
        } catch {}
      }
    } else {
      const arr = await extractBatch(1, 999);
      arr.forEach((pkg, i) => {
        if (!pkg || typeof pkg !== "object") return;
        const idx = Number(pkg.index) || i + 1;
        collected.set(idx, pkg);
      });
    }

    // Safety sweep: garante que nenhum orçamento entre 1..max(totalCount,10) seja
    // esquecido — cobre casos em que a contagem inicial errou pra menos.
    const targetMax = Math.max(totalCount || 0, 10);
    const stillMissing: number[] = [];
    for (let i = 1; i <= targetMax; i++) if (!collected.has(i)) stillMissing.push(i);
    if (stillMissing.length > 0) {
      try {
        const sweep = await extractBatch(1, targetMax);
        for (const pkg of sweep) {
          if (!pkg || typeof pkg !== "object") continue;
          const idx = Number(pkg.index);
          if (!Number.isFinite(idx) || idx <= 0) continue;
          if (!collected.has(idx)) collected.set(idx, pkg);
        }
      } catch {}
      // Tenta individualmente os que ainda faltarem (até 10)
      for (const i of stillMissing) {
        if (collected.has(i)) continue;
        if (collected.size >= 10) break;
        try {
          const arr = await extractBatch(i, i);
          for (const pkg of arr) {
            if (!pkg || typeof pkg !== "object") continue;
            const idx = Number(pkg.index) || i;
            if (!collected.has(idx)) collected.set(idx, pkg);
          }
        } catch {}
      }
    }

    const arr = [...collected.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);


    const cleanNo = (v: any): string | undefined => {
      if (v == null) return undefined;
      const digits = String(v).replace(/[^0-9]/g, "");
      return digits || undefined;
    };
    const sanitizeFlight = (f: any) => {
      if (!f || typeof f !== "object") return f;
      if (f.flight_number !== undefined) f.flight_number = cleanNo(f.flight_number);
      if (Array.isArray(f.segments)) {
        f.segments = f.segments.map((s: any) => ({
          ...s,
          flight_number: s?.flight_number !== undefined ? cleanNo(s.flight_number) : s?.flight_number,
        }));
      }
      return f;
    };
    for (const pkg of arr) {
      if (!pkg || typeof pkg !== "object") continue;
      delete (pkg as any).index;
      pkg.outbound_flight = sanitizeFlight(pkg.outbound_flight);
      pkg.return_flight = sanitizeFlight(pkg.return_flight);
      Object.assign(pkg, normalizePackageFlights(pkg));
      if (pkg.hotel_stars != null) {
        const n = Math.round(Number(pkg.hotel_stars));
        pkg.hotel_stars = Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : undefined;
      }
      pkg.supplier_name = normalizePackageSupplier(pkg.supplier_name);
    }

    return { packages: arr };
  });

