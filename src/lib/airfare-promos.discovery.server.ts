/**
 * RADAR DE OPORTUNIDADES — Melhores Destinos.
 *
 * Aqui o Melhores Destinos é usado APENAS para descobrir oportunidades
 * (origem, destino, datas reais e preço de referência). O preço comercial
 * NUNCA vem daqui: cada candidata é obrigatoriamente revalidada no motor
 * VIA AIR antes de virar promoção.
 *
 * Reaproveita o mesmo serviço já usado pela tela "Passagens Baratas"
 * (`melhores-destinos.server.ts`) — não existe segunda implementação.
 */
import { scopeOfRoute } from "@/lib/br-airports";
import {

  MAX_EXTRA_ORIGINS,
  PRIORITY_ORIGINS,

  isPriorityOrigin,
  isOriginAllowedForScope,

  maxOpportunitiesForOrigin,
  type OriginMetrics,
} from "@/lib/airfare-promos.config";
import { curateOrigin, type CurationDecision } from "@/lib/airfare-promos.curation";
import { datasDaRotaHandler, listarPromocoesHandler } from "@/lib/melhores-destinos.server";

export type PromoCandidate = {
  signature: string;
  scope: "nacional" | "internacional";
  origin_iata: string;
  origin_city: string | null;
  destination_iata: string;
  destination_city: string | null;
  departure_date: string;
  return_date: string | null;
  priority: number;
  reference_source: string;
  reference_price: number | null;
  reference_origin: string | null;
  reference_destination: string | null;
  reference_departure_date: string | null;
  reference_return_date: string | null;
  reference_collected_at: string;
};

/** Origens que precisam estar sempre representadas na curadoria (config central). */
export { PRIORITY_ORIGINS_NACIONAL, PRIORITY_ORIGINS_HUB } from "@/lib/airfare-promos.config";


/** Sementes usadas só para garantir cobertura das origens prioritárias. */
export const PRIORITY_SEEDS: Array<{
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  scope: "nacional" | "internacional";
}> = [
  { origin: "MGF", originCity: "Maringá", destination: "GRU", destinationCity: "São Paulo", scope: "nacional" },
  { origin: "LDB", originCity: "Londrina", destination: "GRU", destinationCity: "São Paulo", scope: "nacional" },
  { origin: "CWB", originCity: "Curitiba", destination: "GIG", destinationCity: "Rio de Janeiro", scope: "nacional" },
  { origin: "CAC", originCity: "Cascavel", destination: "GRU", destinationCity: "São Paulo", scope: "nacional" },
  { origin: "IGU", originCity: "Foz do Iguaçu", destination: "GRU", destinationCity: "São Paulo", scope: "nacional" },
  { origin: "GRU", originCity: "São Paulo", destination: "LIS", destinationCity: "Lisboa", scope: "internacional" },
  { origin: "GIG", originCity: "Rio de Janeiro", destination: "MCO", destinationCity: "Orlando", scope: "internacional" },
  { origin: "BSB", originCity: "Brasília", destination: "EZE", destinationCity: "Buenos Aires", scope: "internacional" },
  { origin: "CWB", originCity: "Curitiba", destination: "SCL", destinationCity: "Santiago", scope: "internacional" },
];

export function scopeOf(origin: string, destination: string): "nacional" | "internacional" {
  return scopeOfRoute(origin, destination);
}


/** Assinatura da OPORTUNIDADE (sem companhia) — usada para deduplicar a fila. */
export function candidateSignature(p: {
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string | null;
}): string {
  return [p.origin_iata, p.destination_iata, p.departure_date, p.return_date ?? "-"].join("|").toUpperCase();
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Datas de fallback DIVERSIFICADAS (só para sementes/rotas monitoradas).
 *
 * Nada de +45/+75 com 7 noites fixas para todo mundo: cada rota recebe
 * janelas diferentes (a partir de um hash estável da própria rota), variando
 * mês de saída, dia da semana e duração da viagem. Assim os cards de fallback
 * não se concentram sempre nos mesmos dois períodos.
 */
function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const FALLBACK_WINDOWS = [32, 48, 61, 74, 88, 103, 117, 132, 146, 161, 178, 195];
const FALLBACK_NIGHTS = [4, 5, 6, 7, 8, 9, 10, 12, 14];

export function diversifiedDatePairs(
  key: string,
  count = 2,
): Array<{ departureDate: string; returnDate: string }> {
  const h = hashKey(key);
  const base = new Date();
  const pares: Array<{ departureDate: string; returnDate: string }> = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    const janela = FALLBACK_WINDOWS[(h + i * 5) % FALLBACK_WINDOWS.length] ?? 45;
    const jitter = ((h >> (i + 1)) % 11) - 5; // ±5 dias
    const noites = FALLBACK_NIGHTS[(h + i * 3) % FALLBACK_NIGHTS.length] ?? 7;
    const out = new Date(base);
    out.setDate(out.getDate() + Math.max(21, janela + jitter));
    const back = new Date(out);
    back.setDate(back.getDate() + noites);
    pares.push({ departureDate: iso(out), returnDate: iso(back) });
  }
  return pares;
}

/** @deprecated use diversifiedDatePairs — mantido para compatibilidade. */
export function fallbackDatePairs(offsets = [45, 75]) {
  const base = new Date();
  return offsets.map((off) => {
    const out = new Date(base);
    out.setDate(out.getDate() + off);
    const back = new Date(out);
    back.setDate(back.getDate() + 7);
    return { departureDate: iso(out), returnDate: iso(back) };
  });
}

function isFuture(dateIso: string) {
  return dateIso >= iso(new Date());
}

export type DiscoveryResult = {
  /** Candidatas já deduplicadas E limitadas por origem (fila de validação). */
  candidates: PromoCandidate[];
  /** Total bruto descoberto na fonte, antes do limite por origem. */
  discoveredTotal: number;
  /** Total após deduplicação, antes do limite por origem. */
  dedupedTotal: number;
  /** Métricas por origem (radar / dedup / elegíveis / selecionadas). */
  metrics: OriginMetrics[];
  /** Auditoria da curadoria (o que entrou, o que foi excluído e por quê). */
  decisions?: CurationDecision<PromoCandidate>[];
  /** O radar do Melhores Destinos respondeu nesta execução? */
  radarAvailable: boolean;
  /** Quantas consultas ao radar falharam (503/timeout). */
  radarErrors: number;
  /** Oportunidades vindas efetivamente do Melhores Destinos. */
  radarLeads: number;
  /** Candidatas geradas por fallback (sementes de cobertura). */
  fallbackCount: number;
  /** Métricas da camada compartilhada de acesso ao Melhores Destinos. */
  sourceMetrics?: Record<string, unknown>;
  /** A descoberta foi interrompida por pedido de cancelamento. */
  cancelled?: boolean;
};

/** Oportunidade em nível de DESTINO, antes de escolher as datas. */
type Lead = {
  origin_iata: string;
  origin_city: string | null;
  destination_iata: string;
  destination_city: string | null;
  scope: "nacional" | "internacional";
  reference_price: number | null;
  category_id: number | null;
  reference_source: string;
  /** datas já conhecidas (vindas do feed de promoções) */
  dates: Array<{ departDate: string; returnDate: string | null; price: number | null }>;
  /** campos exigidos pela curadoria */
  signature: string;
  departure_date: string;
  return_date: string | null;
};

/**
 * Descobre oportunidades no Melhores Destinos e devolve candidatas
 * normalizadas e deduplicadas (uma validação por oportunidade).
 *
 * FUNIL (o corte só acontece no fim):
 *  1. RADAR: feed de promoções + varredura de TODAS as categorias por origem
 *     (nacionais e internacionais) — sem limite.
 *  2. DEDUP por origem+destino (mantém a referência mais barata).
 *  3. CURADORIA por escopo: exclusões, apelo turístico, diversidade e cotas.
 *  4. Só as escolhidas (até N nacionais + N internacionais por origem)
 *     buscam datas reais e entram na fila cara do motor VIA AIR.
 */
export async function discoverCandidates(opts?: {
  pages?: number;
  datesPerRoute?: number;
  /** teto de segurança da leitura bruta (não é o limite por origem) */
  maxCandidates?: number;
  /** cancelamento cooperativo: checado inclusive durante espera/backoff */
  cancel?: () => boolean | Promise<boolean>;
  /** progresso real para a UI */
  onProgress?: (msg: string) => void;
}): Promise<DiscoveryResult> {
  const { radarByOrigin, cheapestDatesForLead, normalizeIata, mapLimit, MdCancelledError } =
    await import("@/lib/airfare-promos.radar.server");
  const { mdSourceMetrics, resetMdSourceMetrics, mdRadarAvailable } = await import(
    "@/lib/melhores-destinos.server"
  );
  const cancel = opts?.cancel;
  const progresso = opts?.onProgress ?? (() => {});
  let cancelada = false;
  resetMdSourceMetrics();
  progresso("Consultando radar de oportunidades...");
  const collectedAt = new Date().toISOString();
  const datesPerRoute = Math.max(1, opts?.datesPerRoute ?? 1);

  /** pool[origem][destino] */
  const pool = new Map<string, Map<string, Lead>>();
  let brutas = 0;

  const addLead = (lead: Omit<Lead, "signature" | "departure_date" | "return_date">) => {
    brutas++;
    if (!isOriginAllowedForScope(lead.origin_iata, lead.scope)) return;
    const porOrigem = pool.get(lead.origin_iata) ?? new Map<string, Lead>();
    const atual = porOrigem.get(lead.destination_iata);
    const primeira = lead.dates[0];
    const novo: Lead = {
      ...lead,
      signature: `${lead.origin_iata}|${lead.destination_iata}`,
      departure_date: primeira?.departDate ?? "",
      return_date: primeira?.returnDate ?? null,
    };
    if (!atual) {
      porOrigem.set(lead.destination_iata, novo);
    } else {
      // mesma rota vinda das duas fontes: fica a referência mais barata e
      // aproveita as datas já conhecidas.
      const melhorPreco =
        (novo.reference_price ?? Infinity) < (atual.reference_price ?? Infinity)
          ? novo.reference_price
          : atual.reference_price;
      atual.reference_price = melhorPreco;
      atual.category_id = atual.category_id ?? novo.category_id;
      atual.destination_city = atual.destination_city ?? novo.destination_city;
      atual.origin_city = atual.origin_city ?? novo.origin_city;
      if (novo.dates.length && !atual.dates.length) {
        atual.dates = novo.dates;
        atual.departure_date = novo.departure_date;
        atual.return_date = novo.return_date;
      }
    }
    pool.set(lead.origin_iata, porOrigem);
  };

  // ------------------------------------------------------------------
  // 1a) RADAR — feed de promoções do Melhores Destinos (já traz datas)
  // ------------------------------------------------------------------
  let radarErrors = 0;
  let radarLeads = 0;
  let promos: Awaited<ReturnType<typeof listarPromocoesHandler>>["promos"] = [];
  try {
    const res = await listarPromocoesHandler({ data: { pages: opts?.pages ?? 3 } });
    promos = res.promos;
  } catch {
    promos = [];
    radarErrors++;
  }

  for (const promo of promos) {
    if (!promo.key) continue;
    for (const rota of promo.routes) {
      const origin = normalizeIata(rota.originCode);
      const destination = normalizeIata(rota.destinationCode);
      if (origin.length !== 3 || destination.length !== 3 || origin === destination) continue;
      const scope = scopeOf(origin, destination);
      if (!isOriginAllowedForScope(origin, scope)) continue;

      let datas: Array<{ departDate: string; returnDate: string | null; price: number | null }> = [];
      try {
        const det = await datasDaRotaHandler({
          data: { key: promo.key, from: rota.originCode.toUpperCase(), to: rota.destinationCode.toUpperCase() },
        });
        datas = det.dates
          .filter((d) => isFuture(d.departDate))
          .slice(0, datesPerRoute)
          .map((d) => ({ departDate: d.departDate, returnDate: d.returnDate, price: d.price || null }));
      } catch {
        datas = [];
      }

      addLead({
        origin_iata: origin,
        origin_city: rota.originName ?? null,
        destination_iata: destination,
        destination_city: rota.destinationName ?? null,
        scope,
        reference_price: datas[0]?.price ?? rota.price ?? null,
        category_id: null,
        reference_source: "melhores_destinos",
        dates: datas,
      });
    }
  }

  // ------------------------------------------------------------------
  // 1b) RADAR POR ORIGEM — varre todas as categorias/destinos monitorados
  //     de cada origem prioritária (é isso que dava só 2 candidatas para
  //     MGF/LDB/CAC/IGU quando dependíamos apenas do feed).
  // ------------------------------------------------------------------
  await mapLimit(PRIORITY_ORIGINS, 1, async (origem: string) => {
    if (cancelada) return;
    let leads: Awaited<ReturnType<typeof radarByOrigin>> = [];
    if (!mdRadarAvailable()) {
      radarErrors++;
      return;
    }
    progresso(`Consultando radar de oportunidades — ${origem}...`);
    try {
      leads = await radarByOrigin(origem, { cancel });
    } catch (e) {
      if (e instanceof MdCancelledError) {
        cancelada = true;
        return;
      }
      leads = [];
      radarErrors++;
    }
    for (const l of leads) {
      addLead({
        origin_iata: l.origin_iata,
        origin_city: l.origin_city,
        destination_iata: l.destination_iata,
        destination_city: l.destination_city,
        scope: l.scope,
        reference_price: l.reference_price,
        category_id: l.category_id,
        reference_source: "md_radar_origem",
        dates: [],
      });
    }
  });

  // Tudo que entrou no pool até aqui veio do Melhores Destinos.
  radarLeads = [...pool.values()].reduce((acc, m) => acc + m.size, 0);
  const radarAvailable = radarLeads > 0 && mdRadarAvailable();
  progresso(
    radarAvailable
      ? `Curadoria em andamento — ${radarLeads} oportunidades descobertas`
      : "Radar temporariamente indisponível — promoções anteriores preservadas",
  );

  // ------------------------------------------------------------------
  // 1c) COBERTURA MÍNIMA — complemento CONTROLADO. Só entra se o radar
  //     respondeu nesta execução; se o MD estiver fora do ar, a coleta não
  //     é preenchida artificialmente com sementes.
  // ------------------------------------------------------------------
  let fallbackCount = 0;
  const MAX_FALLBACK_SEEDS = Math.min(4, Math.floor(radarLeads * 0.15));
  if (radarAvailable) {
    for (const seed of PRIORITY_SEEDS) {
      if (fallbackCount >= MAX_FALLBACK_SEEDS) break;
      if ((pool.get(seed.origin)?.size ?? 0) > 0) continue;
      fallbackCount++;
      addLead({
        origin_iata: seed.origin,
        origin_city: seed.originCity,
        destination_iata: seed.destination,
        destination_city: seed.destinationCity,
        scope: seed.scope,
        reference_price: null,
        category_id: null,
        reference_source: "fallback",
        dates: [],
      });
    }
  }

  // ------------------------------------------------------------------
  // 2/3) CURADORIA POR ESCOPO — o corte de N por origem acontece aqui,
  //      depois de percorrer TODAS as oportunidades descobertas.
  // ------------------------------------------------------------------
  const metrics: OriginMetrics[] = [];
  const auditoria: CurationDecision<PromoCandidate>[] = [];
  const escolhidasPorOrigem: Array<{ origem: string; leads: Lead[]; scope: "nacional" | "internacional" }> = [];

  const origens = [...pool.keys()].sort((a, b) => {
    const pa = isPriorityOrigin(a) ? 0 : 1;
    const pb = isPriorityOrigin(b) ? 0 : 1;
    return pa - pb || a.localeCompare(b);
  });

  let extrasUsadas = 0;
  let dedupTotal = 0;
  for (const origem of origens) {
    const prioritaria = isPriorityOrigin(origem);
    if (!prioritaria) {
      if (extrasUsadas >= MAX_EXTRA_ORIGINS) continue;
      extrasUsadas++;
    }
    const lista = [...(pool.get(origem)?.values() ?? [])];
    dedupTotal += lista.length;
    const limite = maxOpportunitiesForOrigin(origem);

    let elegiveis = 0;
    let excluidas = 0;
    let selNacional = 0;
    let selInternacional = 0;

    for (const scope of ["nacional", "internacional"] as const) {
      if (!isOriginAllowedForScope(origem, scope)) continue;
      const grupo = lista.filter((l) => l.scope === scope);
      if (!grupo.length) continue;
      // limite por ORIGEM e por ESCOPO (10 nacionais + 10 internacionais)
      const res = curateOrigin(origem, grupo, limite);
      elegiveis += res.eligible;
      excluidas += res.excluded;
      if (scope === "nacional") selNacional += res.selected.length;
      else selInternacional += res.selected.length;
      escolhidasPorOrigem.push({ origem, leads: res.selected, scope });
    }

    metrics.push({
      origin: origem,
      discovered: lista.length,
      deduped: lista.length,
      eligible: elegiveis,
      excluded: excluidas,
      selected: selNacional + selInternacional,
      selected_nacional: selNacional,
      selected_internacional: selInternacional,
      validated: 0,
      with_price: 0,
      no_result: 0,
      errors: 0,
      avg_seconds: null,
    });
  }

  // ------------------------------------------------------------------
  // 4) DATAS REAIS — só para as escolhidas (consulta cara, feita por último)
  // ------------------------------------------------------------------
  const selecionadas: PromoCandidate[] = [];
  const todosLeads = escolhidasPorOrigem.flatMap((g) => g.leads);

  progresso(`Buscando datas reais de ${todosLeads.length} oportunidades selecionadas...`);
  await mapLimit(todosLeads, 1, async (lead: Lead) => {
    if (cancelada) return;
    let datas = lead.dates;
    if (!datas.length) {
      try {
        const res = await cheapestDatesForLead(
          {
            origin_iata: lead.origin_iata,
            origin_city: lead.origin_city,
            destination_iata: lead.destination_iata,
            destination_city: lead.destination_city,
            scope: lead.scope,
            reference_price: lead.reference_price,
            category_id: lead.category_id,
          },
          datesPerRoute,
          cancel,
        );
        datas = res.map((d) => ({ departDate: d.departDate, returnDate: d.returnDate, price: d.price }));
      } catch (e) {
        if (e instanceof MdCancelledError) {
          cancelada = true;
          return;
        }
        datas = [];
      }
    }
    let datasSaoFallback = false;
    if (!datas.length) {
      datasSaoFallback = true;
      const pares = diversifiedDatePairs(
        `${lead.origin_iata}${lead.destination_iata}`,
        Math.max(1, datesPerRoute),
      );
      datas = pares.map((p) => ({ departDate: p.departureDate, returnDate: p.returnDate, price: null }));
      if (!datas.length) return;
    }

    for (const d of datas.slice(0, datesPerRoute)) {
      selecionadas.push({
        signature: candidateSignature({
          origin_iata: lead.origin_iata,
          destination_iata: lead.destination_iata,
          departure_date: d.departDate,
          return_date: d.returnDate,
        }),
        scope: lead.scope,
        origin_iata: lead.origin_iata,
        origin_city: lead.origin_city,
        destination_iata: lead.destination_iata,
        destination_city: lead.destination_city,
        departure_date: d.departDate,
        return_date: d.returnDate,
        priority: lead.scope === "nacional" ? 10 : 20,
        reference_source:
          datasSaoFallback && lead.reference_price == null ? "fallback" : lead.reference_source,
        reference_price: d.price ?? lead.reference_price,
        reference_origin: lead.origin_iata,
        reference_destination: lead.destination_iata,
        // datas de referência só existem quando vieram mesmo do MD
        reference_departure_date: datasSaoFallback ? null : d.departDate,
        reference_return_date: datasSaoFallback ? null : d.returnDate,
        reference_collected_at: collectedAt,
      });
    }
  });

  // dedup final por assinatura (origem|destino|datas)
  const finais = new Map<string, PromoCandidate>();
  for (const c of selecionadas) if (!finais.has(c.signature)) finais.set(c.signature, c);
  const lista = [...finais.values()].slice(0, opts?.maxCandidates ?? 600);

  return {
    candidates: lista.sort((a, b) => a.priority - b.priority),
    discoveredTotal: brutas,
    dedupedTotal: dedupTotal,
    metrics,
    decisions: auditoria,
    radarAvailable,
    radarErrors,
    radarLeads,
    fallbackCount: lista.filter((c) => c.reference_source === "fallback").length,
    sourceMetrics: mdSourceMetrics(),
    cancelled: cancelada,
  };
}


