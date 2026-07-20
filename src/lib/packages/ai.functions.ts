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
- carry_on/checked_bag/personal_item: ícone colorido/ativo = true; ícone cinza/riscado = false.
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
        model: "openai/gpt-5.5",
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

    const system = `Você extrai dados de PACOTES TURÍSTICOS a partir de orçamentos, vouchers e itinerários (PDF ou imagem) de operadoras (Visual, CVC, Azul Viagens, Flytour, etc).
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
  "meal_plan": "Café da manhã | Meia pensão | Pensão completa | All inclusive | Sem refeição",
  "room_type": "Standard | Superior | Luxo | ...",
  "room_category": "Standard",
  "bed_type": "Casal | Solteiro | Duplo",
  "includes": ["Hospedagem", "Aéreo", "Traslados", "Passeios"],
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
- meal_plan: se "Café da Manhã" → "Café da manhã"; "All inclusive"/"Tudo incluído" → "All inclusive"; senão o que aparecer.
- hotel_stars: número inteiro de 1 a 5 (conte as estrelas ou pegue a classificação).
- includes: liste os itens da seção "Incluso" do documento.
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
        model: "openai/gpt-5.5",
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
      sanitizeFlight(parsed.outbound_flight);
      sanitizeFlight(parsed.return_flight);
      if (parsed.hotel_stars != null) {
        const n = Math.round(Number(parsed.hotel_stars));
        parsed.hotel_stars = Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : undefined;
      }
    }

    return { pkg: parsed };
  });
