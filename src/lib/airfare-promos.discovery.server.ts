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
  {
    origin: "MGF",
    originCity: "Maringá",
    destination: "GRU",
    destinationCity: "São Paulo",
    scope: "nacional",
  },
  {
    origin: "LDB",
    originCity: "Londrina",
    destination: "GRU",
    destinationCity: "São Paulo",
    scope: "nacional",
  },
  {
    origin: "CWB",
    originCity: "Curitiba",
    destination: "GIG",
    destinationCity: "Rio de Janeiro",
    scope: "nacional",
  },
  {
    origin: "CAC",
    originCity: "Cascavel",
    destination: "GRU",
    destinationCity: "São Paulo",
    scope: "nacional",
  },
  {
    origin: "IGU",
    originCity: "Foz do Iguaçu",
    destination: "GRU",
    destinationCity: "São Paulo",
    scope: "nacional",
  },
  {
    origin: "GRU",
    originCity: "São Paulo",
    destination: "LIS",
    destinationCity: "Lisboa",
    scope: "internacional",
  },
  {
    origin: "GIG",
    originCity: "Rio de Janeiro",
    destination: "MCO",
    destinationCity: "Orlando",
    scope: "internacional",
  },
  {
    origin: "BSB",
    originCity: "Brasília",
    destination: "EZE",
    destinationCity: "Buenos Aires",
    scope: "internacional",
  },
  {
    origin: "CWB",
    originCity: "Curitiba",
    destination: "SCL",
    destinationCity: "Santiago",
    scope: "internacional",
  },
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
  return [p.origin_iata, p.destination_iata, p.departure_date, p.return_date ?? "-"]
    .join("|")
    .toUpperCase();
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
  /** Causa real quando o radar não devolveu oportunidades. */
  radarError?: string | null;
  /** Etapa em que a falha aconteceu (categories, categories:cities...). */
  radarErrorStage?: string | null;
  /** A descoberta parou por orçamento e deve ser retomada do checkpoint. */
  partial?: boolean;
  /** Checkpoint serializável do progresso (gravado em airfare_promo_runs). */
  state?: DiscoveryState | null;
  /** Progresso real (origens concluídas / total) para a UI. */
  progress?: {
    originsDone: number;
    originsTotal: number;
    leads: number;
    stage: string;
    datesDone?: number;
    datesTotal?: number;
  };
};

/**
 * CHECKPOINT DA DESCOBERTA.
 *
 * A invocação tem vida útil curta (~2 min). A descoberta é fatiada por origem
 * (etapa `leads`) e por lote de oportunidades (etapa `datas`); depois de cada
 * fatia o progresso é gravado no banco. Uma nova invocação retoma exatamente
 * de onde parou — nunca recomeça do zero.
 */
export type DiscoveryState = {
  v: 1;
  stage: "leads" | "datas";
  collectedAt: string;
  brutas: number;
  radarErrors: number;
  originsDone: string[];
  /** tentativas por origem: origem que mata a invocação 2x é descartada */
  originAttempts?: Record<string, number>;
  statusOrigem: Record<string, { status: string; note: string | null }>;
  pool: Record<string, Lead[]>;
  /** etapa `datas`: leads selecionados ainda sem consulta de datas reais */
  pendingLeads?: Lead[];
  /** etapa `datas`: candidatas já montadas */
  candidates?: PromoCandidate[];
  /** etapa `datas`: métricas de curadoria já calculadas */
  metrics?: OriginMetrics[];
  dedupTotal?: number;
  /** total original da fila de datas; não diminui entre retomadas */
  datesTotal?: number;
  /** oportunidades de datas já tentadas, com ou sem oferta encontrada */
  datesDone?: number;
};

export function datesProgress(
  state: Pick<DiscoveryState, "pendingLeads" | "datesTotal" | "datesDone">,
): {
  done: number;
  total: number;
} {
  const pending = state.pendingLeads?.length ?? 0;
  const total = Math.max(state.datesTotal ?? pending, pending);
  const done = Math.min(total, Math.max(state.datesDone ?? total - pending, 0));
  return { done, total };
}

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
  /** retomada: checkpoint salvo pela invocação anterior */
  resumeState?: DiscoveryState | null;
  /** gravação do checkpoint depois de cada origem/lote concluído */
  onCheckpoint?: (
    state: DiscoveryState,
    progress: {
      originsDone: number;
      originsTotal: number;
      leads: number;
      stage: string;
      datesDone?: number;
      datesTotal?: number;
    },
  ) => void | Promise<void>;
};

/** margem mínima para começar mais uma origem/lote sem morrer no meio */
// O checkpoint permite processar poucas origens por invocação sem perder
// progresso. A fatia precisa comportar ao menos um timeout de rede (12s),
// backoff e uma segunda tentativa; 14s tornava o retry impossível.
const SLICE_MIN_MS = 10_000;
const BATCH_MIN_MS = 10_000;
/** Mesmo prazo usado pelo diagnóstico isolado, agora também no fluxo real. */
const ORIGIN_SLICE_MAX_MS = 25_000;
/**
 * Fatia mínima para que a origem seja de fato consultada (timeout de rede de
 * 12s + folga). Abaixo disso a origem é adiada SEM gastar tentativa.
 */
const ORIGIN_ATTEMPT_MIN_MS = 14_000;
/** Tentativas reais (com fatia viável) antes de marcar a origem como timeout. */
const MAX_ORIGIN_ATTEMPTS = 3;

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
    resetRadarMetrics,
    radarSourceMetrics,
    RadarCancelledError,
    RadarDeadlineError,
  } = await import("@/lib/melhores-destinos.radar-api.server");

  const cancel = opts?.cancel;
  const progresso = opts?.onProgress ?? (() => {});
  let cancelada = false;
  const radarDeadline = Date.now() + (opts?.radarBudgetMs ?? 20 * 60_000);
  const semTempo = () => Date.now() >= radarDeadline;
  // A busca de LEADS não pode consumir todo o orçamento: sem tempo sobrando
  // para a etapa de DATAS REAIS a coleta termina com zero candidatas.
  const leadsDeadline = Date.now() + Math.floor((opts?.radarBudgetMs ?? 20 * 60_000) * 0.55);
  const semTempoLeads = () => Date.now() >= leadsDeadline;

  resetRadarMetrics();
  progresso("Varrendo o radar de oportunidades (Melhores Destinos)...");
  const retomada = opts?.resumeState?.v === 1 ? opts.resumeState : null;
  const collectedAt = retomada?.collectedAt ?? new Date().toISOString();
  const datesPerRoute = Math.max(1, opts?.datesPerRoute ?? 1);

  /** pool[origem][destino] */
  const pool = new Map<string, Map<string, Lead>>();
  let brutas = retomada?.brutas ?? 0;
  const originsDone = new Set<string>(retomada?.originsDone ?? []);
  const originAttempts = new Map<string, number>(Object.entries(retomada?.originAttempts ?? {}));
  if (retomada) {
    for (const [origem, leads] of Object.entries(retomada.pool ?? {})) {
      pool.set(origem, new Map(leads.map((l) => [l.destination_iata, l])));
    }
  }

  const contarLeads = () => [...pool.values()].reduce((acc, m) => acc + m.size, 0);
  const serializarPool = (): Record<string, Lead[]> =>
    Object.fromEntries([...pool.entries()].map(([o, m]) => [o, [...m.values()]]));

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
  //    Cada origem recebe uma FATIA JUSTA do orçamento de leads: assim as
  //    últimas da lista (GIG, BSB, POA) nunca ficam sem tempo de varredura.
  //    Depois de CADA origem o progresso vira checkpoint: se a invocação
  //    morrer, a próxima continua da origem seguinte.
  // ------------------------------------------------------------------
  let radarErrors = retomada?.radarErrors ?? 0;
  /** status de cada origem configurada nesta execução (nada some em silêncio) */
  const statusOrigem = new Map<string, { status: string; note: string | null }>();
  for (const o of PRIORITY_ORIGINS) statusOrigem.set(o, { status: "nao_processada", note: null });
  for (const [o, st] of Object.entries(retomada?.statusOrigem ?? {})) statusOrigem.set(o, st);

  const totalOrigens = PRIORITY_ORIGINS.length;

  const snapshot = (stage: "leads" | "datas", extra?: Partial<DiscoveryState>): DiscoveryState => ({
    v: 1,
    stage,
    collectedAt,
    brutas,
    radarErrors,
    originsDone: [...originsDone],
    originAttempts: Object.fromEntries(originAttempts),
    statusOrigem: Object.fromEntries(statusOrigem),
    pool: serializarPool(),
    ...extra,
  });

  const metricasParciais = (): OriginMetrics[] =>
    PRIORITY_ORIGINS.map((o) => ({
      origin: o,
      discovered: pool.get(o)?.size ?? 0,
      deduped: pool.get(o)?.size ?? 0,
      eligible: 0,
      excluded: 0,
      selected: 0,
      selected_nacional: 0,
      selected_internacional: 0,
      validated: 0,
      with_price: 0,
      no_result: 0,
      errors: 0,
      avg_seconds: null,
      radar_status: statusOrigem.get(o)?.status ?? "nao_processada",
      radar_note: statusOrigem.get(o)?.note ?? null,
    }));

  const parcial = (stage: "leads" | "datas", extra?: Partial<DiscoveryState>): DiscoveryResult => ({
    candidates: [],
    discoveredTotal: brutas,
    dedupedTotal: contarLeads(),
    metrics: metricasParciais(),
    decisions: [],
    radarAvailable: contarLeads() > 0,
    radarErrors,
    radarLeads: contarLeads(),
    fallbackCount: 0,
    sourceMetrics: { ...radarSourceMetrics(), radar_adapter: "melhores-destinos.radar-api.server" },
    cancelled: cancelada,
    partial: true,
    state: snapshot(stage, extra),
    progress: {
      originsDone: originsDone.size,
      originsTotal: totalOrigens,
      leads: contarLeads(),
      stage,
      ...(stage === "datas" ? datesProgress(snapshot(stage, extra)) : {}),
    },
  });

  const gravarCheckpoint = async (stage: "leads" | "datas", extra?: Partial<DiscoveryState>) => {
    if (!opts?.onCheckpoint) return;
    const state = snapshot(stage, extra);
    const datas = stage === "datas" ? datesProgress(state) : null;
    try {
      await opts.onCheckpoint(state, {
        originsDone: originsDone.size,
        originsTotal: totalOrigens,
        leads: contarLeads(),
        stage,
        ...(datas ? { datesDone: datas.done, datesTotal: datas.total } : {}),
      });
    } catch {
      /* checkpoint é best-effort: nunca derruba a descoberta */
    }
  };

  // Ordem de varredura INTERCALADA (hub internacional, regional nacional, ...).
  // Antes as origens nacionais vinham todas primeiro e consumiam o orçamento
  // de leads: GRU/GIG/BSB/POA morriam sempre com "prazo esgotado".
  const hubsInt = PRIORITY_ORIGINS.filter((o) => isOriginAllowedForScope(o, "internacional"));
  const regionais = PRIORITY_ORIGINS.filter((o) => !hubsInt.includes(o));
  const ordemOrigens: string[] = [];
  for (let i = 0; i < Math.max(hubsInt.length, regionais.length); i++) {
    if (hubsInt[i]) ordemOrigens.push(hubsInt[i]!);
    if (regionais[i]) ordemOrigens.push(regionais[i]!);
  }

  let indiceOrigem = 0;
  for (const origem of ordemOrigens) {
    indiceOrigem++;
    if (originsDone.has(origem)) continue;
    if (cancelada) {
      statusOrigem.set(origem, { status: "nao_processada", note: "execução cancelada" });
      continue;
    }
    // Sem margem para concluir mais uma origem: grava e devolve o controle.
    // A próxima invocação (cron ou manual) retoma exatamente daqui.
    if (radarDeadline - Date.now() < SLICE_MIN_MS) {
      await gravarCheckpoint("leads");
      return parcial("leads");
    }
    if (semTempoLeads()) {
      statusOrigem.set(origem, {
        status: "sem_tempo",
        note: "orçamento de radar esgotado antes desta origem",
      });
      console.warn(
        `[airfare-radar] WARNING origem ${origem} habilitada, mas não entrou no radar: sem tempo`,
      );
      continue;
    }
    // fatia justa: tempo restante ÷ origens restantes
    const restantes = Math.max(1, totalOrigens - indiceOrigem + 1);
    const fatia = Math.min(
      ORIGIN_SLICE_MAX_MS,
      Math.max(8_000, Math.floor((leadsDeadline - Date.now()) / restantes)),
    );
    const deadlineOrigem = Math.min(leadsDeadline, Date.now() + fatia);
    progresso(`Radar de oportunidades — ${origem} (${indiceOrigem}/${totalOrigens})...`);

    // Fatia menor que uma tentativa de rede viável (timeout de 12s + folga)
    // NÃO conta como tentativa: seria abandonar a origem por falta de tempo,
    // não por falha do radar. Ela volta para a fila da próxima invocação.
    if (fatia < ORIGIN_ATTEMPT_MIN_MS) {
      statusOrigem.set(origem, {
        status: "sem_tempo",
        note: "fatia curta demais para consultar o radar — será varrida na retomada",
      });
      await gravarCheckpoint("leads");
      continue;
    }

    // Origem que já derrubou a invocação N vezes não pode travar a fila:
    // fica registrada como TIMEOUT (nunca como "sem oportunidades") e a
    // descoberta segue para a próxima.
    const tentativas = (originAttempts.get(origem) ?? 0) + 1;
    originAttempts.set(origem, tentativas);
    if (tentativas > MAX_ORIGIN_ATTEMPTS) {
      statusOrigem.set(origem, {
        status: "timeout_radar",
        note: `radar não respondeu dentro do prazo em ${MAX_ORIGIN_ATTEMPTS} tentativas — origem não foi pesquisada`,
      });
      originsDone.add(origem);
      await gravarCheckpoint("leads");
      continue;
    }
    // A tentativa vira checkpoint ANTES da chamada: se a invocação morrer no
    // meio, a próxima sabe que esta origem já foi tentada.
    await gravarCheckpoint("leads");


    const escoposDaOrigem = (["nacional", "internacional"] as const).filter((s) =>
      isOriginAllowedForScope(origem, s),
    );

    try {
      // Teto DURO: nem que a chamada ignore o deadline interno, a fatia acaba.
      const leads = await Promise.race([
        radarLeadsForOrigin(origem, {
          cancel,
          onProgress: progresso,
          deadline: deadlineOrigem,
          scopes: [...escoposDaOrigem],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new RadarDeadlineError()),
            Math.max(5_000, deadlineOrigem - Date.now() + 5_000),
          ),
        ),
      ]);
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
      const encontradas = pool.get(origem)?.size ?? 0;
      statusOrigem.set(origem, {
        // Só aqui existe resposta real do radar: com ou sem resultados.
        status: encontradas ? "com_oportunidades" : "sem_oportunidades",
        note: encontradas
          ? null
          : `radar respondeu normalmente com ${leads.length} lead(s) aproveitável(is) para esta origem`,
      });
    } catch (e) {
      if (e instanceof RadarCancelledError) {
        cancelada = true;
        statusOrigem.set(origem, { status: "nao_processada", note: "execução cancelada" });
        break;
      }
      if (e instanceof RadarDeadlineError) {
        // Estourar a fatia NÃO encerra a origem: ela volta para a fila e é
        // varrida na próxima invocação (até o limite de tentativas).
        statusOrigem.set(origem, {
          status: "timeout_radar",
          note: `radar não respondeu dentro do prazo (tentativa ${tentativas}/${MAX_ORIGIN_ATTEMPTS}) — será varrida na retomada`,
        });
        await gravarCheckpoint("leads");
        continue;
      }


      radarErrors++;
      const msg = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
      statusOrigem.set(origem, { status: "erro_radar", note: msg });
      console.warn(`[airfare-radar] WARNING origem ${origem} falhou no radar: ${msg}`);
    }
    originsDone.add(origem);
    await gravarCheckpoint("leads");
  }

  // §15 — se o atalho por origem não devolver nada, percorre o caminho
  // oficial da API: categorias → destinos → origens do destino → itinerário.
  if (![...pool.values()].some((m) => m.size) && !cancelada && !semTempoLeads()) {
    progresso("Radar — varrendo categorias e destinos do Melhores Destinos...");
    try {
      const leads = await radarLeadsByCategory([...PRIORITY_ORIGINS], {
        cancel,
        onProgress: progresso,
        deadline: leadsDeadline,
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
      metrics: PRIORITY_ORIGINS.map((o) => ({
        origin: o,
        discovered: 0,
        deduped: 0,
        eligible: 0,
        excluded: 0,
        selected: 0,
        selected_nacional: 0,
        selected_internacional: 0,
        validated: 0,
        with_price: 0,
        no_result: 0,
        errors: 0,
        avg_seconds: null,
        radar_status: statusOrigem.get(o)?.status ?? "sem_oportunidades",
        radar_note: statusOrigem.get(o)?.note ?? null,
      })),

      decisions: [],
      radarAvailable: false,
      radarErrors,
      radarLeads: 0,
      fallbackCount: 0,
      sourceMetrics: {
        ...radarSourceMetrics(),
        radar_adapter: "melhores-destinos.radar-api.server",
      },
      cancelled: cancelada,
      radarError: (radarSourceMetrics() as { lastError?: string | null }).lastError ?? null,
      radarErrorStage: radarErrors ? "radar" : "sem_oportunidades",
    };
  }

  // ------------------------------------------------------------------
  // 2/3) CURADORIA POR ESCOPO — o corte de N por origem acontece aqui,
  //      depois de percorrer TODAS as oportunidades descobertas.
  // ------------------------------------------------------------------
  const retomandoDatas = retomada?.stage === "datas";
  const metrics: OriginMetrics[] = retomandoDatas ? [...(retomada.metrics ?? [])] : [];
  const auditoria: CurationDecision<PromoCandidate>[] = [];
  const escolhidasPorOrigem: Array<{
    origem: string;
    leads: Lead[];
    scope: "nacional" | "internacional";
  }> = [];

  let dedupTotal = retomandoDatas ? (retomada.dedupTotal ?? contarLeads()) : 0;

  // Na retomada de `datas`, a fila e as métricas já estão fechadas no
  // checkpoint. Recalcular toda a curadoria aqui não alterava o resultado e
  // consumia orçamento antes de continuar a próxima oportunidade pendente.
  if (!retomandoDatas) {
    // TODAS as origens configuradas entram no relatório — mesmo com zero
    // oportunidades — para nunca sumirem em silêncio do acompanhamento.
    const origens = [...new Set<string>([...PRIORITY_ORIGINS, ...pool.keys()])].sort((a, b) => {
      const pa = isPriorityOrigin(a) ? 0 : 1;
      const pb = isPriorityOrigin(b) ? 0 : 1;
      return pa - pb || a.localeCompare(b);
    });

    let extrasUsadas = 0;
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
        const res = curateOrigin(origem, grupo, limite);
        elegiveis += res.eligible;
        excluidas += res.excluded;
        if (scope === "nacional") selNacional += res.selected.length;
        else selInternacional += res.selected.length;
        escolhidasPorOrigem.push({ origem, leads: res.selected, scope });
      }

      const st = statusOrigem.get(origem);
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
        radar_status: st?.status ?? (lista.length ? "ok" : "sem_oportunidades"),
        radar_note: st?.note ?? null,
      });
    }
  }

  // ------------------------------------------------------------------
  // 4) DATAS/OFERTAS REAIS — só para as escolhidas (consulta cara).
  //    Processada em LOTES com checkpoint: o que não couber no orçamento
  //    fica gravado como `pendingLeads` e é retomado na próxima invocação.
  // ------------------------------------------------------------------
  const selecionadas: PromoCandidate[] = [
    ...(retomada?.stage === "datas" ? (retomada.candidates ?? []) : []),
  ];
  const curados = escolhidasPorOrigem.flatMap((g) => g.leads);
  const pendentesSalvos = retomada?.stage === "datas" ? (retomada.pendingLeads ?? null) : null;
  const todosLeads = pendentesSalvos ?? curados;
  const restantesFila = [...todosLeads];
  const datesTotal =
    retomada?.stage === "datas"
      ? Math.max(retomada.datesTotal ?? 0, (retomada.datesDone ?? 0) + todosLeads.length)
      : todosLeads.length;
  let datesDone =
    retomada?.stage === "datas"
      ? Math.min(retomada.datesDone ?? Math.max(0, datesTotal - todosLeads.length), datesTotal)
      : 0;

  // Marca a transição ANTES da primeira chamada externa. Se a invocação morrer
  // no meio, a retomada nunca volta ao checkpoint de `leads`.
  await gravarCheckpoint("datas", {
    pendingLeads: restantesFila,
    candidates: selecionadas,
    metrics,
    dedupTotal,
    datesTotal,
    datesDone,
  });
  progresso(
    `Consultando oportunidades ${datesTotal}/${datesTotal} · Datas reais ${datesDone}/${datesTotal}`,
  );

  // Uma oportunidade por checkpoint. O antigo lote de quatro só confirmava o
  // avanço depois que TODAS terminavam; expirar durante o lote fazia as quatro
  // primeiras serem consultadas novamente na próxima invocação.
  while (restantesFila.length > 0) {
    if (cancelada) break;
    if (radarDeadline - Date.now() < BATCH_MIN_MS) {
      await gravarCheckpoint("datas", {
        pendingLeads: restantesFila,
        candidates: selecionadas,
        metrics,
        dedupTotal,
        datesTotal,
        datesDone,
      });
      return parcial("datas", {
        pendingLeads: restantesFila,
        candidates: selecionadas,
        metrics,
        dedupTotal,
        datesTotal,
        datesDone,
      });
    }
    const lead = restantesFila[0];
    if (!lead) break;
    progresso(
      `Consultando oportunidades ${datesTotal}/${datesTotal} · Datas reais ${datesDone}/${datesTotal}`,
    );
    // Confirma a retirada ANTES da chamada externa. Assim uma morte abrupta
    // nunca consulta a mesma rota de novo na retomada. O custo dessa garantia
    // é conservador: se o processo morrer exatamente durante a chamada, a rota
    // é considerada tentada e o próximo ciclo diário poderá reencontrá-la.
    restantesFila.shift();
    datesDone++;
    await gravarCheckpoint("datas", {
      pendingLeads: restantesFila,
      candidates: selecionadas,
      metrics,
      dedupTotal,
      datesTotal,
      datesDone,
    });
    progresso(
      `Consultando oportunidades ${datesTotal}/${datesTotal} · Datas reais ${datesDone}/${datesTotal}`,
    );
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
    if (!cancelada && lead.itinerary_link && !semTempo()) {
      try {
        // Uma rota lenta não recebe todo o orçamento restante nem bloqueia as
        // seguintes. O adaptador ainda pode fazer seu retry curto dentro deste
        // teto, mas a rota entra apenas uma vez nesta fila.
        const deadlineDaRota = Math.min(radarDeadline, Date.now() + 15_000);
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
          { cancel, deadline: deadlineDaRota },
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
        } else {
          radarErrors++;
          ofertas = [];
        }
      }
    }
    // Sem datas reais do radar a oportunidade é descartada: não inventamos
    // datas. Mesmo assim a tentativa é confirmada e não volta à fila.
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
    // Segundo checkpoint persiste apenas o resultado encontrado. A posição da
    // fila já foi confirmada antes da rede e não pode regredir.
    await gravarCheckpoint("datas", {
      pendingLeads: restantesFila,
      candidates: selecionadas,
      metrics,
      dedupTotal,
      datesTotal,
      datesDone,
    });
  }

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
    sourceMetrics: { ...radarSourceMetrics(), radar_adapter: "melhores-destinos.radar-api.server" },
    cancelled: cancelada,
    radarError: null,
    radarErrorStage: null,
    partial: false,
    state: null,
    progress: {
      originsDone: originsDone.size,
      originsTotal: totalOrigens,
      leads: radarLeads,
      stage: "concluida",
    },
  };
}
