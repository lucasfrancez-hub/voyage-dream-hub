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
  /** metadados do radar (referência; nunca substituem o preço VIA AIR) */
  radar_airline_code?: string | null;
  radar_airline_name?: string | null;
  radar_baggage?: string | null;
  radar_provider?: string | null;
  radar_external_url?: string | null;
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
  category?: string | null;
  /** link oficial de itinerary_prices devolvido pela própria API do radar */
  itinerary_link?: string | null;
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
type DiscoverOptions = {
  pages?: number;
  datesPerRoute?: number;
  /** teto de segurança da leitura bruta (não é o limite por origem) */
  maxCandidates?: number;
  /** cancelamento cooperativo: checado inclusive durante espera/backoff */
  cancel?: () => boolean | Promise<boolean>;
  /** progresso real para a UI */
  onProgress?: (msg: string) => void;
  /** orçamento de tempo da etapa de radar (o ritmo é 15–30s por chamada) */
  radarBudgetMs?: number;
};

/**
 * Descoberta 100% via API JSON do Melhores Destinos (radar).
 * O preço encontrado aqui é APENAS referência: cada candidata é
 * obrigatoriamente revalidada no motor VIA AIR antes de virar promoção.
 */
export async function discoverCandidates(opts?: DiscoverOptions): Promise<DiscoveryResult> {
  const {
    radarLeadsForOrigin,
    radarLeadsByCategory,
    radarOpportunitiesForLead,
    mapLimit,
    resetRadarMetrics,
    radarSourceMetrics,
    RadarCancelledError,
  } = await import("@/lib/melhores-destinos.radar-api.server");

  const cancel = opts?.cancel;
  const progresso = opts?.onProgress ?? (() => {});
  let cancelada = false;
  const radarDeadline = Date.now() + (opts?.radarBudgetMs ?? 20 * 60_000);
  const semTempo = () => Date.now() >= radarDeadline;
  resetRadarMetrics();
  progresso("Varrendo o radar de oportunidades (Melhores Destinos)...");
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
    } else if ((novo.reference_price ?? Infinity) < (atual.reference_price ?? Infinity)) {
      atual.reference_price = novo.reference_price;
      atual.itinerary_link = novo.itinerary_link ?? atual.itinerary_link;
      atual.category_id = novo.category_id ?? atual.category_id;
      atual.category = novo.category ?? atual.category;
      atual.destination_city = atual.destination_city ?? novo.destination_city;
      atual.origin_city = atual.origin_city ?? novo.origin_city;
    }
    pool.set(lead.origin_iata, porOrigem);
  };

  // ------------------------------------------------------------------
  // 1) RADAR — categorias → destinos monitorados de cada origem
  // ------------------------------------------------------------------
  let radarErrors = 0;
  for (const origem of PRIORITY_ORIGINS) {
    if (cancelada || semTempo()) break;
    progresso(`Radar de oportunidades — ${origem}...`);
    try {
      const leads = await radarLeadsForOrigin(origem, {
        cancel,
        onProgress: progresso,
        deadline: radarDeadline,
      });
      for (const l of leads) {
        addLead({
          origin_iata: l.origin.iata,
          origin_city: l.origin.city,
          destination_iata: l.destination.iata,
          destination_city: l.destination.city,
          scope: l.scope,
          reference_price: l.radarPrice,
          category_id: l.categoryId,
          category: l.category,
          itinerary_link: l.itineraryLink,
          reference_source: "md_radar_api",
          dates: [],
        });
      }
    } catch (e) {
      if (e instanceof RadarCancelledError) {
        cancelada = true;
        break;
      }
      radarErrors++;
    }
  }

  // §15 — se o atalho por origem não devolver nada, percorre o caminho
  // oficial da API: categorias → destinos → origens do destino → itinerário.
  if (![...pool.values()].some((m) => m.size) && !cancelada && !semTempo()) {
    progresso("Radar — varrendo categorias e destinos do Melhores Destinos...");
    try {
      const leads = await radarLeadsByCategory([...PRIORITY_ORIGINS], {
        cancel,
        onProgress: progresso,
        deadline: radarDeadline,
      });
      for (const l of leads) {
        addLead({
          origin_iata: l.origin.iata,
          origin_city: l.origin.city,
          destination_iata: l.destination.iata,
          destination_city: l.destination.city,
          scope: l.scope,
          reference_price: l.radarPrice,
          category_id: l.categoryId,
          category: l.category,
          itinerary_link: l.itineraryLink,
          reference_source: "md_radar_api",
          dates: [],
        });
      }
    } catch (e) {
      if (e instanceof RadarCancelledError) cancelada = true;
      else radarErrors++;
    }
  }

  const radarLeads = [...pool.values()].reduce((acc, m) => acc + m.size, 0);
  const radarAvailable = radarLeads > 0;
  progresso(
    radarAvailable
      ? `Curadoria em andamento — ${radarLeads} oportunidades encontradas`
      : "Radar sem oportunidades novas — promoções anteriores preservadas",
  );

  // Radar indisponível: nada de sementes/fallback artificial.
  if (!radarLeads) {
    return {
      candidates: [],
      discoveredTotal: brutas,
      dedupedTotal: 0,
      metrics: [],
      decisions: [],
      radarAvailable: false,
      radarErrors,
      radarLeads: 0,
      fallbackCount: 0,
      sourceMetrics: radarSourceMetrics(),
      cancelled: cancelada,
    };
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
  // 4) DATAS/OFERTAS REAIS — só para as escolhidas (consulta cara)
  // ------------------------------------------------------------------
  const selecionadas: PromoCandidate[] = [];
  const todosLeads = escolhidasPorOrigem.flatMap((g) => g.leads);

  progresso(`Buscando datas reais de ${todosLeads.length} oportunidades selecionadas...`);
  await mapLimit(todosLeads, 1, async (lead: Lead) => {
    if (cancelada || !lead.itinerary_link) return;
    let ofertas: Array<{
      departDate: string;
      returnDate: string | null;
      price: number | null;
      airlineCode: string | null;
      airlineName: string | null;
      baggage: string | null;
      provider: string | null;
      externalUrl: string | null;
    }> = [];
    if (!semTempo()) {
      try {
        const res = await radarOpportunitiesForLead(
          {
            source: "melhores_destinos",
            type: lead.scope === "nacional" ? "national" : "international",
            scope: lead.scope,
            categoryId: lead.category_id,
            category: lead.category ?? null,
            origin: { iata: lead.origin_iata, city: lead.origin_city },
            destination: { iata: lead.destination_iata, city: lead.destination_city },
            radarPrice: lead.reference_price,
            currency: "BRL",
            itineraryLink: lead.itinerary_link,
            collectedAt,
          },
          datesPerRoute,
          { cancel },
        );
        ofertas = res
          .filter((o) => isFuture(o.departureDate))
          .map((o) => ({
            departDate: o.departureDate,
            returnDate: o.returnDate,
            price: o.radarPrice,
            airlineCode: o.airlineCode,
            airlineName: o.airlineName,
            baggage: o.baggage,
            provider: o.provider,
            externalUrl: o.externalUrl,
          }));
      } catch (e) {
        if (e instanceof RadarCancelledError) {
          cancelada = true;
          return;
        }
        radarErrors++;
        ofertas = [];
      }
    }
    // Sem datas reais do radar a oportunidade é descartada: não inventamos datas.
    if (!ofertas.length) return;

    for (const d of ofertas.slice(0, datesPerRoute)) {
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
        reference_source: lead.reference_source,
        reference_price: d.price ?? lead.reference_price,
        reference_origin: lead.origin_iata,
        reference_destination: lead.destination_iata,
        reference_departure_date: d.departDate,
        reference_return_date: d.returnDate,
        reference_collected_at: collectedAt,
        radar_airline_code: d.airlineCode,
        radar_airline_name: d.airlineName,
        radar_baggage: d.baggage,
        radar_provider: d.provider,
        radar_external_url: d.externalUrl,
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
    fallbackCount: 0,
    sourceMetrics: radarSourceMetrics(),
    cancelled: cancelada,
  };
}



