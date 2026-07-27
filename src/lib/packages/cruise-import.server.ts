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
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { cruiseDetailsSchema, type CruiseDetails } from "@/lib/packages/cruise";

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

async function firecrawlScrape(url: string): Promise<{ markdown: string; title?: string }> {
  const res = await fetch(`${GATEWAY}/scrape`, {
    method: "POST",
    headers: firecrawlHeaders(),
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
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
  "cabin", "cabine", "stateroom", "suite", "suíte",
  "itiner", "itiner", "roteiro",
  "ship", "navio", "vessel",
  "deck", "plano",
  "port", "porto", "destino",
  "gallery", "galeria", "photo",
  "amenit", "restaurante", "dining", "entertainment",
  "excurs",
];

function pickRelevantTabs(base: string, links: string[], max = 8): string[] {
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

export async function extractCruiseFromUrl(url: string): Promise<{
  cruise_details: CruiseDetails;
  sources: string[];
  warnings: string[];
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const warnings: string[] = [];

  // 1. Página principal
  const main = await firecrawlScrape(url);
  if (!main.markdown.trim()) {
    throw new Error("Não consegui ler conteúdo dessa URL (página vazia ou bloqueada).");
  }

  // 2. Descobre + raspa abas
  const links = await firecrawlMap(url);
  const tabs = pickRelevantTabs(url, links, 8);
  const scraped: { url: string; markdown: string }[] = [{ url, markdown: main.markdown }];
  await Promise.all(
    tabs.map(async (t) => {
      try {
        const r = await firecrawlScrape(t);
        if (r.markdown.trim()) scraped.push({ url: t, markdown: r.markdown });
      } catch (err) {
        warnings.push(`Falha ao ler ${t}: ${(err as Error).message}`);
      }
    }),
  );

  // Limita tamanho pra não estourar contexto (500k chars é seguro pro Gemini 3.6)
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

  // 3. Extração com Gemini
  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-3.6-flash");

  const prompt = `Você extrai dados estruturados de páginas de cruzeiros marítimos em pt-BR.

Recebi o conteúdo (markdown) da página do cruzeiro e de suas abas. Extraia TUDO que conseguir e devolva no schema JSON.

Regras:
- Preços em BRL (número, sem símbolo). Se o preço for por pessoa, use pricing.occ2.per_person, occ3.per_person etc. Se for total, divida pela ocupação.
- Se a página mostrar preço por ocupação (dupla/tripla/quádrupla), preencha occ2, occ3, occ4 respectivamente.
- Se houver "3ª pessoa" e "4ª pessoa" com valor diferente, use campos "third" e "fourth".
- Se houver criança com valor reduzido, use "child" (valor por criança).
- Taxas portuárias/serviço vão em taxes_total (total já somado por cabine, não por pessoa).
- experiences = pacotes tipo "Free at Sea", "All Included", "Beverage Package" etc. delta_per_person é o adicional POR PESSOA vs o pacote base (0 se já incluso).
- itinerary: um item por dia. Use "day" numérico (1,2,3...). arrival/departure no formato "HH:MM" ou vazio.
- cabin_categories.type: "interna" | "externa" | "varanda" | "suite".
- Fotos: use URLs absolutas https://.
- map_image: se houver imagem do mapa do itinerário, coloque a URL aqui.
- ship.gallery: fotos do navio (áreas comuns, restaurantes etc.).
- ship.attractions: atrações destacadas (piscina, spa, teatro, restaurantes).
- Se um campo não aparecer, deixe vazio/omita — NÃO invente.
- Todos os IDs devem ser slugs curtos (ex: "cab-interna-1", "exp-free-at-sea-all").

Conteúdo:
${consolidated}

Retorne JSON conforme o schema.`;

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: cruiseDetailsSchema }),
      prompt,
    });
    return {
      cruise_details: output,
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
