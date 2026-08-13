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

/** Datas de fallback (só para sementes/rotas monitoradas). */
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
}): Promise<DiscoveryResult> {
  const { radarByOrigin, cheapestDatesForLead, normalizeIata, mapLimit } = await import(
    "@/lib/airfare-promos.radar.server"
  );
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
  let promos: Awaited<ReturnType<typeof listarPromocoesHandler>>["promos"] = [];
  try {
    const res = await listarPromocoesHandler({ data: { pages: opts?.pages ?? 3 } });
    promos = res.promos;
  } catch {
    promos = [];
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
  await mapLimit(PRIORITY_ORIGINS, 3, async (origem: string) => {
    let leads: Awaited<ReturnType<typeof radarByOrigin>> = [];
    try {
      leads = await radarByOrigin(origem);
    } catch {
      leads = [];
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

  // ------------------------------------------------------------------
  // 1c) COBERTURA MÍNIMA — origem sem nenhum resultado no radar
  // ------------------------------------------------------------------
  for (const seed of PRIORITY_SEEDS) {
    if ((pool.get(seed.origin)?.size ?? 0) > 0) continue;
    addLead({
      origin_iata: seed.origin,
      origin_city: seed.originCity,
      destination_iata: seed.destination,
      destination_city: seed.destinationCity,
      scope: seed.scope,
      reference_price: null,
      category_id: null,
      reference_source: "origem_prioritaria",
      dates: [],
    });
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

  await mapLimit(todosLeads, 5, async (lead: Lead) => {
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
        );
        datas = res.map((d) => ({ departDate: d.departDate, returnDate: d.returnDate, price: d.price }));
      } catch {
        datas = [];
      }
    }
    if (!datas.length) {
      const [p1] = fallbackDatePairs([45]);
      if (!p1) return;
      datas = [{ departDate: p1.departureDate, returnDate: p1.returnDate, price: null }];
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
        reference_source: lead.reference_source,
        reference_price: d.price ?? lead.reference_price,
        reference_origin: lead.origin_iata,
        reference_destination: lead.destination_iata,
        reference_departure_date: d.departDate,
        reference_return_date: d.returnDate,
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
  };
}


