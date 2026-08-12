/**
 * Busca a página do Melhores Destinos (renderizada, via Firecrawl) e devolve
 * a tabela de passagens em JSON já com os links do motor da VIA AIR.
 *
 * O site bloqueia requisições diretas de servidor (WAF), por isso usamos o
 * Firecrawl, que renderiza a página como um navegador real.
 */
import { z } from "zod";
import { parseMelhoresDestinos, type MdTable } from "@/lib/melhores-destinos.parse";

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

export const melhoresDestinosInput = z.object({
  url: z.string().url().max(2000),
  /** Base absoluta pros links da VIA AIR (ex.: https://pedidos.viaair.tur.br) */
  base: z.string().max(200).optional(),
});
export type MelhoresDestinosInput = z.infer<typeof melhoresDestinosInput>;

function headers() {
  const lov = process.env["LOVABLE_API_KEY"];
  const fc = process.env["FIRECRAWL_API_KEY"];
  if (!lov || !fc) throw new Error("Firecrawl não configurado (LOVABLE_API_KEY/FIRECRAWL_API_KEY).");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": fc,
  };
}

async function scrapeHtml(url: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/scrape`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false, waitFor: 6000 }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl falhou [${res.status}]: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    rawHtml?: string;
    html?: string;
    data?: { rawHtml?: string; html?: string };
  };
  const html = json.rawHtml ?? json.html ?? json.data?.rawHtml ?? json.data?.html ?? "";
  if (!html) throw new Error("Firecrawl não devolveu o HTML da página.");
  return html;
}

/** Se a URL for de uma promoção, descobre a página /voos correspondente. */
function findVoosUrl(html: string): string | null {
  const m = /https?:\/\/www\.melhoresdestinos\.com\.br\/voos\?[^"'\s<>]+/i.exec(
    html.replace(/&amp;/g, "&"),
  );
  return m ? m[0] : null;
}

export async function scrapeMelhoresDestinosHandler({
  data,
}: {
  data: MelhoresDestinosInput;
}): Promise<MdTable> {
  const base = (data.base ?? "").replace(/\/$/, "");
  let url = data.url.trim();
  if (!/melhoresdestinos\.com\.br/i.test(url)) {
    throw new Error("Envie um link do site Melhores Destinos.");
  }

  let html = await scrapeHtml(url);
  let table = parseMelhoresDestinos(html, url, base);

  if (!table.offers.length) {
    const voos = findVoosUrl(html);
    if (voos && voos !== url) {
      url = voos;
      html = await scrapeHtml(url);
      table = parseMelhoresDestinos(html, url, base);
    }
  }

  if (!table.offers.length) {
    throw new Error("Não encontrei a tabela de datas nesta página. Use o link '/voos?rota=...'.");
  }
  return table;
}
