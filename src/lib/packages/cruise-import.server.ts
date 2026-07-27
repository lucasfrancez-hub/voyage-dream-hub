/**
 * Importador de cruzeiros por URL.
 *
 * Fluxo:
 * 1. Firecrawl `map` pra descobrir subpáginas (cabines, itinerário, navio, deck).
 * 2. Firecrawl `scrape` (markdown) da URL principal + até N abas relevantes.
 * 3. Manda o markdown consolidado pro Gemini com o schema `cruiseDetailsSchema`
 *    e devolve o objeto pronto pra colar em `packages.cruise_details`.
 */
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { cruiseDetailsSchema, type CruiseDetails } from "@/lib/packages/cruise";

/** Campos top-level do pacote (mapeáveis pra colunas de `packages`). */
export const cruisePackageFieldsSchema = z.object({
  title: z.string().default(""),
  destination: z.string().default(""),
  origin: z.string().default(""),
  going_date: z.string().default(""),   // YYYY-MM-DD
  return_date: z.string().default(""),  // YYYY-MM-DD
  nights: z.number().int().nonnegative().default(0),
  price_from: z.number().nonnegative().default(0),
  supplier: z.string().default(""),
});
export type CruisePackageFields = z.infer<typeof cruisePackageFieldsSchema>;

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

function firecrawlHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const fc = process.env.FIRECRAWL_API_KEY;
  if (!lov || !fc) throw new Error("Firecrawl não configurado (LOVABLE_API_KEY/FIRECRAWL_API_KEY).");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": fc,
  };
}

export type ScrapeAuth = {
  /** Header Cookie completo (ex: "PHPSESSID=abc; user=xyz"). */
  cookie?: string;
  /** Headers extras arbitrários (ex: Authorization, X-CSRF-Token). */
  headers?: Record<string, string>;
};

function buildScrapeBody(url: string, auth?: ScrapeAuth) {
  const extraHeaders: Record<string, string> = { ...(auth?.headers ?? {}) };
  if (auth?.cookie) extraHeaders.Cookie = auth.cookie;
  const body: Record<string, unknown> = {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
  };
  if (Object.keys(extraHeaders).length > 0) body.headers = extraHeaders;
  return body;
}

async function firecrawlScrape(
  url: string,
  auth?: ScrapeAuth,
): Promise<{ markdown: string; title?: string }> {
  const res = await fetch(`${GATEWAY}/scrape`, {
    method: "POST",
    headers: firecrawlHeaders(),
    body: JSON.stringify(buildScrapeBody(url, auth)),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl scrape falhou [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as {
    markdown?: string;
    data?: { markdown?: string; metadata?: { title?: string } };
    metadata?: { title?: string };
  };
  const markdown = data.markdown ?? data.data?.markdown ?? "";
  const title = data.metadata?.title ?? data.data?.metadata?.title;
  return { markdown, title };
}

async function firecrawlMap(url: string): Promise<string[]> {
  try {
    const res = await fetch(`${GATEWAY}/map`, {
      method: "POST",
      headers: firecrawlHeaders(),
      body: JSON.stringify({ url, limit: 120, includeSubdomains: false }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { links?: (string | { url?: string })[] };
    const links = data.links ?? [];
    return links
      .map((l) => (typeof l === "string" ? l : l?.url ?? ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}


// palavras que sugerem abas úteis do cruzeiro
const RELEVANT = [
  "cabin", "cabine", "stateroom", "suite", "suíte", "acomoda",
  "itiner", "roteiro", "day-by-day",
  "ship", "navio", "vessel", "embarca",
  "deck", "plano",
  "port", "porto", "destino",
  "gallery", "galeria", "photo", "foto",
  "amenit", "restaurante", "dining", "entertainment", "gastro",
  "excurs", "passeio", "tour",
  "adicional", "opcional", "extra", "addon", "add-on",
  "beverage", "bebida", "drink", "bar",
  "wifi", "internet",
  "gorjeta", "gratuit", "service-charge",
  "transfer", "translado",
  "seguro", "insurance",
  "spa", "fitness",
  "inclui", "incluso", "included", "not-included",
  "politica", "policy", "cancel", "reembolso", "pagamento", "payment",
  "documento", "document",
  "crianc", "children", "kids",
];

function pickRelevantTabs(base: string, links: string[], max = 20): string[] {
  const baseUrl = new URL(base);
  const seen = new Set<string>([base.replace(/#.*$/, "")]);
  const picked: string[] = [];
  for (const raw of links) {
    if (picked.length >= max) break;
    try {
      const u = new URL(raw, base);
      if (u.host !== baseUrl.host) continue;
      const key = `${u.origin}${u.pathname}`;
      if (seen.has(key)) continue;
      const hay = `${u.pathname} ${u.search}`.toLowerCase();
      if (!RELEVANT.some((w) => hay.includes(w))) continue;
      seen.add(key);
      picked.push(u.toString());
    } catch {
      // ignora URLs inválidas
    }
  }
  return picked;
}

export async function extractCruiseFromUrl(
  url: string,
  auth?: ScrapeAuth,
): Promise<{
  cruise_details: CruiseDetails;
  package_fields: CruisePackageFields;
  sources: string[];
  warnings: string[];
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const warnings: string[] = [];

  // 1. Página principal
  const main = await firecrawlScrape(url, auth);
  if (!main.markdown.trim()) {
    throw new Error("Não consegui ler conteúdo dessa URL (página vazia ou bloqueada).");
  }
  // Sinal comum de que o cookie expirou / precisa login
  const lower = main.markdown.toLowerCase();
  if (/(faça login|entrar na conta|sign in|log in|acesso restrito)/.test(lower) && lower.length < 4000) {
    warnings.push("A página parece exigir login. Se os dados vierem incompletos, atualize o cookie no campo abaixo.");
  }

  // 2. Descobre + raspa abas (reutiliza o mesmo cookie/headers)
  const links = await firecrawlMap(url);
  const tabs = pickRelevantTabs(url, links, 20);
  const scraped: { url: string; markdown: string }[] = [{ url, markdown: main.markdown }];
  await Promise.all(
    tabs.map(async (t) => {
      try {
        const r = await firecrawlScrape(t, auth);
        if (r.markdown.trim()) scraped.push({ url: t, markdown: r.markdown });
      } catch (err) {
        warnings.push(`Falha ao ler ${t}: ${(err as Error).message}`);
      }
    }),
  );


  // Limita tamanho pra não estourar contexto
  const MAX = 450_000;
  let total = 0;
  const chunks: string[] = [];
  for (const s of scraped) {
    const header = `\n\n===== FONTE: ${s.url} =====\n\n`;
    const remaining = MAX - total;
    if (remaining <= 500) break;
    const body = s.markdown.slice(0, remaining - header.length);
    chunks.push(header + body);
    total += header.length + body.length;
  }
  const consolidated = chunks.join("");

  // 3. Extração com Gemini — schema LENIENTE (evita falhas de .url()/enums)
  //    e depois reparseamos com o schema estrito que tem defaults/coerções.
  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-3.6-flash");

  // Schema super permissivo pro LLM — sem .url(), sem enums estritos,
  // tudo opcional. A validação real acontece depois via parseCruiseDetails.
  const lenientSchema = z.object({
    package_fields: z
      .object({
        title: z.string().optional(),
        destination: z.string().optional(),
        origin: z.string().optional(),
        going_date: z.string().optional(),
        return_date: z.string().optional(),
        nights: z.number().optional(),
        price_from: z.number().optional(),
        supplier: z.string().optional(),
      })
      .optional(),
    cruise_details: z
      .object({
        cabin_categories: z.array(z.any()).optional(),
        experiences: z.array(z.any()).optional(),
        addons: z.array(z.any()).optional(),
        included: z.array(z.string()).optional(),
        not_included: z.array(z.string()).optional(),
        policies: z.any().optional(),
        ship: z.any().optional(),
        itinerary: z.array(z.any()).optional(),
        map_image: z.string().optional(),
        notes: z.string().optional(),
      })
      .optional(),
  });

  const prompt = `Você extrai dados estruturados de páginas de cruzeiros marítimos em pt-BR.

Recebi o conteúdo (markdown) da página do cruzeiro e de suas abas. Extraia LITERALMENTE TUDO que conseguir — nada de resumir ou omitir.

Regras package_fields (top-level do pacote):
- title: nome curto do cruzeiro (ex: "MSC Preziosa - Caribe 7 noites").
- destination: destino principal (ex: "Caribe", "Mediterrâneo", "Fiordes"). NÃO inclua o país entre parênteses.
- origin: porto de embarque (ex: "Santos", "Miami", "Barcelona"). Se não achar, vazio.
- going_date / return_date: datas de embarque e desembarque no formato YYYY-MM-DD.
- nights: número de noites do cruzeiro.
- price_from: menor preço por pessoa em ocupação dupla (BRL, número).
- supplier: operadora (ex: "MSC Cruzeiros", "Costa", "Royal Caribbean").

Regras cruise_details — EXTRAIA TUDO:
- cabin_categories: TODAS as cabines. Campos: id (slug), type ("interna"|"externa"|"varanda"|"suite"), code, name, description, size_m2, capacity (número), photos (URLs absolutas https://), category_codes, pricing { occ2/occ3/occ4: { per_person, third?, fourth?, child? } }, taxes_total (número).
- experiences: pacotes fechados (Free at Sea, Bella, Fantastica, Aurea). { id, name, description, benefits[], delta_per_person (número), recommended (boolean) }.
- addons: TODOS os opcionais avulsos. { id, name, description, price (número), price_unit ("per_person"|"per_cabin"|"per_day"|"per_person_per_day"|"fixed"), category ("bebidas"|"wifi"|"gorjeta"|"transfer"|"seguro"|"excursao"|"restaurante"|"spa"|"outro") }.
- included / not_included: arrays de strings.
- policies: { payment, cancellation, boarding, documents, children_policy, other } — strings com texto integral.
- ship: { name, line, gallery[], deck_plan_image, videos[], attractions[{title, description, image}], data_sheet[{label, value}] }.
- itinerary: um item por dia. { day (número), date, port, country, arrival ("HH:MM" ou ""), departure, description, photo }.
- map_image: URL absoluta https:// do mapa, se houver.
- notes: observações extras.

Regras gerais:
- URLs sempre absolutas https:// — se não for, omita.
- Se um campo não aparecer, omita — NÃO invente.
- IDs em slug curto.

Conteúdo:
${consolidated}

Retorne JSON conforme o schema.`;

  let raw: z.infer<typeof lenientSchema> | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2 && !raw; attempt++) {
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: lenientSchema }),
        prompt,
      });
      raw = output;
    } catch (err) {
      lastErr = err;
      if (!NoObjectGeneratedError.isInstance(err)) throw err;
    }
  }

  if (!raw) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`A IA não conseguiu estruturar os dados: ${msg}`);
  }

  // Sanitiza URLs inválidas (relativas, "N/A", vazias) antes do parse estrito
  const isUrlKey = (k: string) =>
    /photo|image|gallery|map_image|deck_plan|videos|photos/i.test(k);
  const sanitize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sanitize);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === "string" && isUrlKey(k)) {
          out[k] = /^https?:\/\//i.test(val) ? val : "";
        } else if (Array.isArray(val) && isUrlKey(k)) {
          out[k] = val.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u));
        } else {
          out[k] = sanitize(val);
        }
      }
      return out;
    }
    return v;
  };

  const cleaned = sanitize(raw) as z.infer<typeof lenientSchema>;
  const details: CruiseDetails = cruiseDetailsSchema.parse(cleaned.cruise_details ?? {});
  const fields: CruisePackageFields = cruisePackageFieldsSchema.parse(cleaned.package_fields ?? {});

  return {
    cruise_details: details,
    package_fields: fields,
    sources: scraped.map((s) => s.url),
    warnings,
  };
}
