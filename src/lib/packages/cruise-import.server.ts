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
      body: JSON.stringify({ url, limit: 40, includeSubdomains: false }),
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
  const tabs = pickRelevantTabs(url, links, 8);
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

  // 3. Extração com Gemini — schema combinado (top-level + cruise_details)
  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-3.6-flash");

  const combinedSchema = z.object({
    package_fields: cruisePackageFieldsSchema,
    cruise_details: cruiseDetailsSchema,
  });

  const prompt = `Você extrai dados estruturados de páginas de cruzeiros marítimos em pt-BR.

Recebi o conteúdo (markdown) da página do cruzeiro e de suas abas. Extraia TUDO que conseguir.

Regras package_fields (top-level do pacote):
- title: nome curto do cruzeiro (ex: "MSC Preziosa - Caribe 7 noites").
- destination: destino principal (ex: "Caribe", "Mediterrâneo", "Fiordes"). NÃO inclua o país entre parênteses.
- origin: porto de embarque (ex: "Santos", "Miami", "Barcelona"). Se não achar, vazio.
- going_date / return_date: datas de embarque e desembarque no formato YYYY-MM-DD.
- nights: número de noites do cruzeiro.
- price_from: menor preço por pessoa em ocupação dupla (BRL, número).
- supplier: operadora (ex: "MSC Cruzeiros", "Costa", "Royal Caribbean").

Regras cruise_details:
- Preços em BRL (número, sem símbolo). Se o preço for por pessoa, use pricing.occ2.per_person, occ3.per_person etc.
- Se houver "3ª pessoa" e "4ª pessoa" com valor diferente, use campos "third" e "fourth".
- Se houver criança com valor reduzido, use "child" (valor por criança).
- Taxas portuárias/serviço vão em taxes_total (total por cabine, não por pessoa).
- experiences = pacotes tipo "Free at Sea", "All Included". delta_per_person é o adicional POR PESSOA vs o pacote base.
- itinerary: um item por dia. Use "day" numérico. arrival/departure em "HH:MM" ou vazio.
- cabin_categories.type: "interna" | "externa" | "varanda" | "suite".
- Fotos: URLs absolutas https://.
- Se um campo não aparecer, deixe vazio/omita — NÃO invente.
- IDs slugs curtos (ex: "cab-interna-1", "exp-free-at-sea-all").

Conteúdo:
${consolidated}

Retorne JSON conforme o schema.`;

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: combinedSchema }),
      prompt,
    });
    return {
      cruise_details: output.cruise_details,
      package_fields: output.package_fields,
      sources: scraped.map((s) => s.url),
      warnings,
    };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      throw new Error(`A IA não conseguiu estruturar os dados: ${err.message}`);
    }
    throw err;
  }
}
