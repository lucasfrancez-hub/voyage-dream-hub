/**
 * Conector Omio (somente pesquisa/leitura — nunca reserva).
 *
 * A Omio fica atrás de Cloudflare, então reaproveitamos o mesmo CDP/Browserless
 * usado na Expedia TAAP: abrimos uma aba real e falamos com as APIs internas
 * de dentro da página.
 */

import { ExpediaCdp, openRemoteBrowser, closeRemoteBrowser } from "@/lib/expedia/browser.server";
import {
  OMIO_BASE,
  deepLinkResultsUrl,
  journeyPageUrl,
  pageFetchScript,
  readSearchIdScript,
  resultsApiUrl,
  resultsPageUrl,
  searchTriggerGetUrl,
  submitSearchScript,
  suggesterUrl,
} from "./queries";

import { normalizarExtras, normalizarResultados, normalizarTarifas } from "./normalize";
import type { OmioBusca, OmioDetalhe, OmioPosition } from "./types";

type PageFetch = { ok: boolean; status: number; body?: string; error?: string };

async function withOmioPage<T>(
  startUrl: string,
  fn: (cdp: ExpediaCdp, diag: string[]) => Promise<T>,
): Promise<T> {
  const diag: string[] = [];
  const ws = await openRemoteBrowser({ url: startUrl, reconnectMs: 60_000, viewportWidth: 1440, viewportHeight: 900 });
  const cdp = await ExpediaCdp.connect(ws);
  try {
    await cdp.attachToPage();
    diag.push(`Aba aberta em ${startUrl}`);
    return await fn(cdp, diag);
  } finally {
    cdp.close();
    await closeRemoteBrowser(ws);
  }
}

async function pageFetch(cdp: ExpediaCdp, url: string): Promise<PageFetch> {
  const raw = await cdp.evaluate<string>(pageFetchScript(url));
  if (!raw) return { ok: false, status: 0, error: "sem resposta da página" };
  try {
    return JSON.parse(raw) as PageFetch;
  } catch {
    return { ok: false, status: 0, error: "resposta inválida" };
  }
}

function parseJson(body?: string): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function ddmmyyyy(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Navega a aba atual (Page.navigate) e dá um tempo pro contexto reconstruir. */
async function navegar(cdp: ExpediaCdp, url: string) {
  await cdp.send("Page.navigate", { url }).catch(() => null);
  await sleep(2500);
}

/** Autocomplete de estações/cidades. */
export async function omioSugerir(termo: string, locale = "en"): Promise<OmioPosition[]> {
  const url = suggesterUrl(termo, locale);
  // Tentativa direta primeiro (mais barata); cai pro navegador se o Cloudflare barrar.
  try {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
    if (r.ok) {
      const json = (await r.json()) as unknown;
      const parsed = mapPositions(json);
      if (parsed.length) return parsed;
    }
  } catch {
    /* ignore */
  }

  return withOmioPage(`${OMIO_BASE}/?locale=${locale}`, async (cdp) => {
    const res = await pageFetch(cdp, url);
    return mapPositions(parseJson(res.body));
  });
}

function mapPositions(json: unknown): OmioPosition[] {
  const arr = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { positions?: unknown[] }).positions)
      ? ((json as { positions: unknown[] }).positions)
      : [];
  return arr
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => ({
      id: String(p["positionId"] ?? p["id"] ?? ""),
      nome: String(p["displayName"] ?? p["name"] ?? p["fullName"] ?? ""),
      tipo: String(p["positionType"] ?? p["type"] ?? "position"),
      pais: typeof p["countryName"] === "string" ? (p["countryName"] as string) : undefined,
    }))
    .filter((p) => p.id && p.nome)
    .slice(0, 12);
}

/** Dispara a busca e devolve os resultados normalizados. */
export async function omioBuscar(input: {
  origemId: string;
  destinoId: string;
  data: string; // yyyy-mm-dd
  adultos?: number;
  modo?: string;
  moeda?: string;
  locale?: string;
}): Promise<OmioBusca> {
  const modo = input.modo ?? "train";
  const locale = input.locale ?? "en";
  const adultos = input.adultos ?? 1;

  return withOmioPage(`${OMIO_BASE}/?locale=${locale}`, async (cdp, diag) => {
    const params = {
      departureFk: input.origemId,
      arrivalFk: input.destinoId,
      departureDate: ddmmyyyy(input.data),
      passengerAges: Array.from({ length: adultos }, () => 30),
      currency: input.moeda ?? "EUR",
      locale,
      travelMode: modo,
    };

    const estado = async () => {
      const raw = await cdp.evaluate<string>(readSearchIdScript);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as {
          url: string;
          searchId: string | null;
          title: string;
          challenge: boolean;
          preview: string;
        };
      } catch {
        return null;
      }
    };

    // Espera o searchId aparecer; retorna também a última URL vista.
    const aguardarSearchId = async (tentativas: number) => {
      let ultimaUrl = "";
      for (let i = 0; i < tentativas; i++) {
        await sleep(1200);
        const st = await estado();
        if (!st) continue; // contexto sendo trocado por navegação
        ultimaUrl = st.url || ultimaUrl;
        if (st.challenge) {
          diag.push(`Cloudflare exibindo desafio ("${st.title}") — aguardando resolver`);
          continue;
        }
        if (st.searchId) return { searchId: st.searchId, url: st.url };
      }
      return { searchId: null as string | null, url: ultimaUrl };
    };

    await cdp.evaluate<string>(submitSearchScript(params));
    diag.push("Formulário de busca enviado (POST)");
    let { searchId, url: urlResultados } = await aguardarSearchId(14);

    if (!searchId) {
      diag.push(`POST não redirecionou (última URL: ${urlResultados || "desconhecida"}) — tentando GET`);
      await navegar(cdp, searchTriggerGetUrl(params));
      ({ searchId, url: urlResultados } = await aguardarSearchId(12));
    }

    if (!searchId) {
      diag.push("GET também não redirecionou — tentando deep link de resultados");
      await navegar(
        cdp,
        deepLinkResultsUrl({
          departureFk: input.origemId,
          arrivalFk: input.destinoId,
          departureDate: ddmmyyyy(input.data),
          travelMode: modo,
          locale,
        }),
      );
      ({ searchId, url: urlResultados } = await aguardarSearchId(12));
    }

    if (!searchId) {
      const st = await estado();
      const motivo = st?.challenge
        ? `Cloudflare bloqueou a sessão ("${st.title}")`
        : `Omio não redirecionou para os resultados (URL final: ${st?.url || urlResultados || "desconhecida"})`;
      diag.push(motivo);
      if (st?.preview) diag.push(`Conteúdo da página: ${st.preview.slice(0, 200)}`);
      return { searchId: "", urlResultados: urlResultados || "", resultados: [], diagnostico: diag };
    }
    diag.push(`searchId=${searchId}`);

    let resultados = normalizarResultados(null, searchId, modo);
    for (let i = 0; i < 12; i++) {
      const res = await pageFetch(cdp, resultsApiUrl(searchId, "outbound"));
      const json = parseJson(res.body);
      resultados = normalizarResultados(json, searchId, modo);
      diag.push(`results/v2 HTTP ${res.status} — ${resultados.length} opção(ões)`);
      if (resultados.length) break;
      await sleep(2000);
    }

    return {
      searchId,
      urlResultados: urlResultados || resultsPageUrl(searchId, modo, locale),
      resultados,
      diagnostico: diag,
    };
  });

}

/** Detalhe de uma viagem: tarifas (Super Saver/Savings/Flex) e extras. */
export async function omioDetalhar(input: {
  searchId: string;
  journeyId: string;
  legId: string;
  modo?: string;
  locale?: string;
}): Promise<OmioDetalhe> {
  const modo = input.modo ?? "train";
  const locale = input.locale ?? "en";
  const url = journeyPageUrl(modo, input.journeyId, input.searchId, input.legId, locale);

  return withOmioPage(url, async (cdp, diag) => {
    // A página de detalhe carrega os dados via APIs internas; capturamos o que
    // ela já hidratou no estado global além de refazer o fetch dos resultados.
    let bruto: unknown = null;
    for (let i = 0; i < 10; i++) {
      await sleep(1500);
      const raw = await cdp.evaluate<string>(`(() => {
        try {
          const keys = Object.keys(window).filter((k) => /__(NEXT|APOLLO|INITIAL|PRELOADED)/i.test(k));
          const state = {};
          for (const k of keys) { try { state[k] = window[k]; } catch (e) {} }
          return JSON.stringify(state).slice(0, 900000);
        } catch (e) { return null; }
      })()`);
      if (raw) {
        bruto = parseJson(raw);
        if (bruto) break;
      }
    }
    diag.push(bruto ? "Estado da página capturado" : "Estado da página indisponível");

    const res = await pageFetch(cdp, resultsApiUrl(input.searchId, "outbound"));
    const resultsJson = parseJson(res.body);
    diag.push(`results/v2 HTTP ${res.status}`);

    const tarifas = [...normalizarTarifas(bruto), ...normalizarTarifas(resultsJson)];
    const extras = [...normalizarExtras(bruto), ...normalizarExtras(resultsJson)];
    const resumo = normalizarResultados(resultsJson, input.searchId, modo).find((r) => r.id === input.journeyId);

    return {
      searchId: input.searchId,
      journeyId: input.journeyId,
      url,
      resumo,
      tarifas: dedupe(tarifas, (t) => t.id),
      extras: dedupe(extras, (e) => e.id),
      bruto,
      diagnostico: diag,
    };
  });
}

function dedupe<T>(arr: T[], key: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
