/**
 * WORKER RETOMÁVEL da coleta de PROMOÇÕES DE AÉREO.
 *
 * A coleta NÃO depende de usuário logado, navegador aberto ou Command Center.
 * O fluxo é: cron (06:00/12:00 BRT) → cria execução → descoberta → fila no
 * banco → este worker consome a fila em lotes com orçamento de tempo. Se o
 * lote acabar por tempo, as candidatas restantes continuam `pending` e são
 * retomadas pelo próximo worker (cron a cada minuto). Nenhuma oportunidade é
 * perdida por timeout, e nada aqui usa sessão/token do admin: apenas a
 * credencial de servidor (service role).
 */
import type { OriginMetrics } from "@/lib/airfare-promos.config";
import {
  buildPromotionRow,
  CANDIDATE_TIMEOUT_MS,
  loadMarkups,
  quoteRoute,
  withTimeout,
} from "@/lib/airfare-promos.server";
import type { MarkupTable } from "@/lib/airfare-conditions";

type AnyClient = { from: (t: string) => any };

/**
 * Orçamento de tempo por invocação. Antes eram 55s, o que fazia a fila esperar
 * o cron do minuto seguinte entre lotes. Agora cada invocação trabalha por
 * vários minutos seguidos (com lease para o cron não sobrepor execuções).
 */
export const WORKER_BUDGET_MS = Number(process.env["AIRFARE_WORKER_BUDGET_MS"] ?? 240_000);

/** Margem do lease além do orçamento (tolerância de finalização). */
const WORKER_LEASE_SLACK_MS = 30_000;


/** Candidata presa em `processing` volta para a fila depois disso. */
const CLAIM_STALE_MS = 6 * 60 * 1000;

/** Execução sem nenhuma atualização por esse tempo é considerada travada. */
export const RUN_STALE_MS = 45 * 60 * 1000;

/** Folga do watchdog além do timeout da candidata antes de abortar à força. */
const WATCHDOG_GRACE_MS = 15_000;

/** Frequência do watchdog de workers. */
const WATCHDOG_TICK_MS = 5_000;


/**
 * Retry NÃO bloqueia worker: a candidata que falhou volta para o FIM da fila
 * (prioridade penalizada) e o worker segue imediatamente para a próxima.
 */
const REQUEUE_PRIORITY_STEP = 1000;

/** Telemetria da fila de validação (gravada em airfare_promo_runs.validation_metrics). */
export type ValidationTelemetry = {
  concurrency: number;
  queued: number;
  running: number;
  completed: number;
  with_fare: number;
  without_fare: number;
  timeout: number;
  error: number;
  requeued: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
  /** detalhamento das últimas falhas (origem, destino, motivo técnico...) */
  failures?: ValidationFailure[];
  /** heartbeat: o que cada worker está validando AGORA */
  in_flight?: WorkerHeartbeat[];
  /** timeout individual configurado (ms) — o painel usa para apontar travamento */
  candidate_timeout_ms?: number;
  updated_at: string;
};

/** Heartbeat de um worker — permite saber exatamente onde o processo congelou. */
export type WorkerHeartbeat = {
  worker_id: number;
  opportunity_id: string;
  origin: string;
  destination: string;
  started_at: string;
  last_activity_at: string;
  elapsed_ms: number;
  attempt: number;
  /** VALIDATING | ABORTING */
  status: string;
};


/** Falha individual de validação — nunca vira "sem tarifa". */
export type ValidationFailure = {
  origin: string;
  destination: string;
  scope: "nacional" | "internacional" | string;
  /** timeout | http | rate_limit | parsing | motor_vazio | indisponivel | erro */
  motive: string;
  motive_label: string;
  step: string;
  message: string;
  duration_ms: number;
  attempts: number;
  timeout: boolean;
  at: string;
};

const MAX_FAILURES_TRACKED = 40;

/** Classifica a causa real da falha a partir da mensagem técnica. */
export function classifyFailure(msg: string): { motive: string; label: string } {
  const m = (msg || "").toLowerCase();
  if (/timeout|tempo esgotado|timed out|abort/.test(m)) return { motive: "timeout", label: "Tempo esgotado" };
  if (/429|rate.?limit|too many requests/.test(m)) return { motive: "rate_limit", label: "Bloqueio/limite de requisições" };
  if (/50[0-9]|http\s*5/.test(m)) return { motive: "http_5xx", label: "Erro no motor (HTTP 5xx)" };
  if (/40[0-9]|http\s*4|unauthorized|forbidden/.test(m)) return { motive: "http_4xx", label: "Erro de requisição (HTTP 4xx)" };
  if (/json|parse|unexpected token|cheerio|selector/.test(m)) return { motive: "parsing", label: "Erro de leitura da resposta" };
  if (/vazio|empty|sem resposta|no data/.test(m)) return { motive: "motor_vazio", label: "Motor respondeu vazio" };
  if (/econn|network|fetch failed|socket|dns|enotfound/.test(m)) return { motive: "indisponivel", label: "Indisponibilidade temporária" };
  if (/gravacao|insert|update|duplicate/.test(m)) return { motive: "gravacao", label: "Erro ao gravar a promoção" };
  return { motive: "erro", label: "Falha técnica na consulta" };
}

/** Desfecho de UMA validação na fila. */
type Desfecho = "with_fare" | "without_fare" | "timeout" | "error" | "requeue";


function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ord.length - 1, Math.ceil((p / 100) * ord.length) - 1);
  return Math.round(ord[Math.max(0, idx)]!);
}

export type CandidateRow = {
  id: string;
  priority?: number | null;
  attempts?: number | null;
  signature: string;
  scope: "nacional" | "internacional";
  origin_iata: string;
  origin_city: string | null;
  destination_iata: string;
  destination_city: string | null;
  departure_date: string;
  return_date: string | null;
  reference_source: string | null;
  reference_price: number | null;
  reference_origin: string | null;
  reference_destination: string | null;
  reference_departure_date: string | null;
  reference_return_date: string | null;
  reference_collected_at: string | null;
  /** entrada na fila — base do tempo de espera (queued_at) */
  created_at?: string | null;
};

const CANDIDATE_COLS =
  "id,priority,attempts,created_at,signature,scope,origin_iata,origin_city,destination_iata,destination_city,departure_date,return_date,reference_source,reference_price,reference_origin,reference_destination,reference_departure_date,reference_return_date,reference_collected_at";

function opportunityKey(p: { origin_iata: string; destination_iata: string; departure_date: string }) {
  return `${p.origin_iata}|${p.destination_iata}|${p.departure_date}`.toUpperCase();
}

/** Dia da curadoria (America/Sao_Paulo) — a comparação NOVA/ALTERADA é sempre do mesmo dia. */
export function curationDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export type CycleState = "new" | "changed" | "unchanged";

type ComparableFare = {
  total_price: number | string;
  airline_iata: string | null;
  outbound_fare_id: string | null;
  inbound_fare_id?: string | null;
  outbound_itinerary_id?: string | null;
  inbound_itinerary_id?: string | null;
  stops?: number | null;
  has_checked_baggage?: boolean | null;
  interest_free_installments?: number | null;
  interest_free_installment_value?: number | string | null;
};

/**
 * Alterações comerciais relevantes entre a promoção que já estava na curadoria
 * do dia e a tarifa revalidada agora. Retorna os campos que mudaram.
 */
export function diffFare(antes: ComparableFare, agora: ComparableFare): string[] {
  const campos: string[] = [];
  const num = (v: unknown) => (v == null ? null : Number(Number(v).toFixed(2)));

  if (num(antes.total_price) !== num(agora.total_price)) campos.push("price");
  if ((antes.airline_iata ?? null) !== (agora.airline_iata ?? null)) campos.push("airline");
  if (
    (antes.outbound_fare_id ?? null) !== (agora.outbound_fare_id ?? null) ||
    (antes.inbound_fare_id ?? null) !== (agora.inbound_fare_id ?? null)
  )
    campos.push("fare_id");
  if (
    (antes.outbound_itinerary_id ?? null) !== (agora.outbound_itinerary_id ?? null) ||
    (antes.inbound_itinerary_id ?? null) !== (agora.inbound_itinerary_id ?? null)
  )
    campos.push("flight");
  if ((antes.stops ?? null) !== (agora.stops ?? null)) campos.push("connection");
  if (!!antes.has_checked_baggage !== !!agora.has_checked_baggage) campos.push("baggage");
  if (
    (antes.interest_free_installments ?? null) !== (agora.interest_free_installments ?? null) ||
    num(antes.interest_free_installment_value) !== num(agora.interest_free_installment_value)
  )
    campos.push("installment");

  return campos;
}


async function db(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

/** Devolve à fila as candidatas presas em `processing`. */
async function releaseStaleClaims(client: AnyClient, runId: string) {
  const limite = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  try {
    await client
      .from("airfare_promo_candidates")
      .update({ status: "pending", claimed_at: null })
      .eq("run_id", runId)
      .eq("status", "processing")
      .lt("claimed_at", limite);
  } catch {
    /* best-effort */
  }
}

/**
 * Processa a fila pendente de uma execução, respeitando o orçamento de tempo.
 * Finaliza a execução quando não sobrar nenhuma candidata pendente.
 */
export async function processPendingCandidates(args: {
  runId: string;
  budgetMs?: number;
  concurrency?: number;
}): Promise<{ processed: number; remaining: number; finished: boolean }> {
  const client = await db();
  const { promoValidationConcurrency, PROMO_VALIDATION_MAX_ATTEMPTS } = await import(
    "@/lib/airfare-promos.config"
  );
  const runId = args.runId;
  const deadline = Date.now() + (args.budgetMs ?? WORKER_BUDGET_MS);
  const concurrency = args.concurrency
    ? Math.min(Math.max(args.concurrency, 1), 12)
    : promoValidationConcurrency();

  /** Cancelar interrompe novos jobs E aborta o que já está em voo. */
  const abortController = new AbortController();

  await releaseStaleClaims(client, runId);

  const { data: run } = await client
    .from("airfare_promo_runs")
    .select(
      "id,status,processed,saved,validated,no_result,error_count,new_count,updated_count,expired_count,origin_metrics",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!run || run.status !== "running") {
    return { processed: 0, remaining: 0, finished: run?.status !== "running" };
  }

  const counters = {
    processed: Number(run.processed ?? 0),
    validated: Number(run.validated ?? 0),
    saved: Number(run.saved ?? 0),
    no_result: Number(run.no_result ?? 0),
    error_count: Number(run.error_count ?? 0),
    new_count: Number(run.new_count ?? 0),
    updated_count: Number(run.updated_count ?? 0),
  };

  const metricas = new Map<string, OriginMetrics>(
    ((run.origin_metrics ?? []) as OriginMetrics[]).map((m) => [m.origin, { ...m }]),
  );
  const tempos = new Map<string, number[]>();

  const metricaDe = (origem: string): OriginMetrics => {
    let m = metricas.get(origem);
    if (!m) {
      m = {
        origin: origem,
        discovered: 0,
        deduped: 0,
        selected: 0,
        validated: 0,
        with_price: 0,
        no_result: 0,
        errors: 0,
        avg_seconds: null,
      };
      metricas.set(origem, m);
    }
    return m;
  };

  const registrarTempo = (origem: string, ms: number) => {
    const lista = tempos.get(origem) ?? [];
    lista.push(ms);
    tempos.set(origem, lista);
    const m = metricaDe(origem);
    const media = lista.reduce((a, b) => a + b, 0) / lista.length / 1000;
    m.avg_seconds = Number(media.toFixed(1));
  };

  const metricasSnapshot = () => [...metricas.values()].sort((a, b) => a.origin.localeCompare(b.origin));

  /* ─── TELEMETRIA DA FILA (visível no Command Center em tempo real) ─── */
  const duracoes: number[] = [];
  const tele = {
    queued: 0,
    running: 0,
    completed: 0,
    with_fare: 0,
    without_fare: 0,
    timeout: 0,
    error: 0,
    requeued: 0,
  };

  const falhas: ValidationFailure[] = [];

  const registrarFalha = (
    cand: { origin_iata: string; destination_iata: string; scope: string },
    dados: { message: string; step: string; duration_ms: number; attempts: number },
  ) => {
    const { motive, label } = classifyFailure(dados.message);
    const item: ValidationFailure = {
      origin: cand.origin_iata,
      destination: cand.destination_iata,
      scope: cand.scope,
      motive,
      motive_label: label,
      step: dados.step,
      message: dados.message.slice(0, 300),
      duration_ms: dados.duration_ms,
      attempts: dados.attempts,
      timeout: motive === "timeout",
      at: new Date().toISOString(),
    };
    falhas.unshift(item);
    if (falhas.length > MAX_FAILURES_TRACKED) falhas.length = MAX_FAILURES_TRACKED;
    console.warn("[airfare-falha]", JSON.stringify(item));
  };

  /* ─── HEARTBEAT DOS WORKERS (quem está validando o quê, agora) ─── */
  type JobVivo = {
    workerId: number;
    ctrl: AbortController;
    cand: CandidateRow;
    startedAt: number;
    lastActivity: number;
    attempt: number;
    status: "VALIDATING" | "ABORTING";
  };
  const emVoo = new Map<number, JobVivo>();

  const heartbeat = (): WorkerHeartbeat[] =>
    [...emVoo.values()].map((j) => ({
      worker_id: j.workerId,
      opportunity_id: j.cand.id,
      origin: j.cand.origin_iata,
      destination: j.cand.destination_iata,
      started_at: new Date(j.startedAt).toISOString(),
      last_activity_at: new Date(j.lastActivity).toISOString(),
      elapsed_ms: Date.now() - j.startedAt,
      attempt: j.attempt,
      status: j.status,
    }));


  const telemetria = (): ValidationTelemetry => ({
    concurrency,
    ...tele,
    avg_duration_ms: duracoes.length
      ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
      : null,
    p95_duration_ms: percentil(duracoes, 95),
    failures: falhas.slice(0, 10),
    in_flight: heartbeat(),
    candidate_timeout_ms: CANDIDATE_TIMEOUT_MS,
    updated_at: new Date().toISOString(),

  });




  const touch = async (patch: Record<string, unknown>) => {
    try {
      await client
        .from("airfare_promo_runs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", runId);
    } catch {
      /* progresso é best-effort */
    }
  };

  const setCandidato = async (id: string, patch: Record<string, unknown>) => {
    try {
      await client.from("airfare_promo_candidates").update(patch).eq("id", id);
    } catch {
      /* best-effort */
    }
  };

  const markups: MarkupTable = await loadMarkups(client);

  /**
   * A primeira coleta do dia (06:00) é a LINHA DE BASE: nada é marcado como
   * nova/alterada. Só a partir da segunda coleta (12:00) o Command Center
   * destaca o que mudou em relação ao estado gerado antes, no mesmo dia.
   */
  const hoje = curationDay();
  const primeiraColetaDoDia = await (async () => {
    try {
      const { data } = await client
        .from("airfare_promo_runs")
        .select("id,started_at")
        .gte("started_at", `${hoje}T03:00:00Z`)
        .order("started_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return !data || (data as { id: string }).id === runId;
    } catch {
      return false;
    }
  })();


  /** Reserva atomicamente a próxima candidata pendente (evita duplo trabalho). */
  const claimNext = async (): Promise<CandidateRow | null> => {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const { data } = await client
        .from("airfare_promo_candidates")
        .select(CANDIDATE_COLS)
        .eq("run_id", runId)
        .eq("status", "pending")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const { data: claimed } = await client
        .from("airfare_promo_candidates")
        .update({ status: "processing", claimed_at: new Date().toISOString() })
        .eq("id", (data as CandidateRow).id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (claimed) return data as CandidateRow;
    }
    return null;
  };

  const processar = async (
    cand: CandidateRow,
    saida: { desfecho: Desfecho; responseAt?: number; engineCalls?: number; engineMs?: number },
    /** sinal DESTE job: o timeout individual aborta as requisições de verdade */
    jobSignal: AbortSignal = abortController.signal,
    /** heartbeat: cada resposta do motor renova a "última atividade" */
    marcarAtividade: () => void = () => {},
  ) => {
    const iniciouEm = Date.now();
    const metrica = metricaDe(cand.origin_iata);
    metrica.validated++;
    const label = `${cand.destination_city ?? cand.destination_iata} (${cand.origin_iata}→${cand.destination_iata})`;

    let row: ReturnType<typeof buildPromotionRow> | null = null;
    const tentativasFeitas = Number(cand.attempts ?? 0) + 1;

    try {
      row = await quoteRoute({
        route: {
          id: cand.id,
          origin_iata: cand.origin_iata,
          origin_city: cand.origin_city,
          destination_iata: cand.destination_iata,
          destination_city: cand.destination_city,
          scope: cand.scope,
          priority: 0,
        },
        departureDate: cand.departure_date,
        returnDate: cand.return_date,
        markups,
        referencePrice: cand.reference_price != null ? Number(cand.reference_price) : null,
        signal: jobSignal,

        onEngineTiming: (t) => {
          marcarAtividade();
          saida.engineCalls = (saida.engineCalls ?? 0) + 1;
          saida.engineMs = (saida.engineMs ?? 0) + t.ms;
          console.log(
            `[motor-viaair] ${cand.origin_iata}->${cand.destination_iata} etapa=${t.step} ms=${t.ms} ok=${t.ok}`,
          );
        },
      });
      saida.responseAt = Date.now();
    } catch (err) {
      saida.responseAt = Date.now();
      const msg = (err instanceof Error ? err.message : String(err)).slice(0, 400);
      registrarTempo(cand.origin_iata, Date.now() - iniciouEm);

      // RETRY SEM BLOQUEAR WORKER: volta pro FIM da fila (prioridade penalizada)
      // e o worker já pega a próxima oportunidade — nada de sleep aqui.
      if (tentativasFeitas < PROMO_VALIDATION_MAX_ATTEMPTS && !abortController.signal.aborted) {
        saida.desfecho = "requeue";
        await setCandidato(cand.id, {
          status: "pending",
          claimed_at: null,
          attempts: tentativasFeitas,
          priority: Number(cand.priority ?? 0) + REQUEUE_PRIORITY_STEP,
          last_error: msg,
          last_error_step: "motor_viaair",
          last_error_at: new Date().toISOString(),
        });
        return label;
      }

      saida.desfecho = /timeout/i.test(msg) ? "timeout" : "error";
      counters.error_count++;
      metrica.errors++;
      registrarFalha(cand, {
        message: msg,
        step: "motor_viaair",
        duration_ms: Date.now() - iniciouEm,
        attempts: tentativasFeitas,
      });

      await setCandidato(cand.id, {
        status: "error",
        attempts: tentativasFeitas,
        last_error: msg,
        last_error_step: "motor_viaair",
        last_error_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      });
      return label;
    }

    if (!row) {
      saida.desfecho = "without_fare";
      counters.no_result++;
      metrica.no_result++;
      registrarTempo(cand.origin_iata, Date.now() - iniciouEm);
      await setCandidato(cand.id, { status: "no_result", processed_at: new Date().toISOString() });
      return label;
    }

    const viaair = Number(row.total_price);
    const ref = cand.reference_price != null ? Number(cand.reference_price) : null;

    const enriquecida = {
      ...row,
      reference_source: cand.reference_source,
      reference_price: ref,
      reference_origin: cand.reference_origin,
      reference_destination: cand.reference_destination,
      reference_departure_date: cand.reference_departure_date,
      reference_return_date: cand.reference_return_date,
      reference_collected_at: cand.reference_collected_at,
      price_difference: ref != null ? Number((viaair - ref).toFixed(2)) : null,
      price_difference_percent: ref ? Number((((viaair - ref) / ref) * 100).toFixed(2)) : null,
      last_run_id: runId,
      unavailable_at: null,
      fare_status: "valida" as const,
    };

    const { data: anterior } = await client
      .from("airfare_promotions")
      .select(
        "id,total_price,airline_iata,outbound_fare_id,inbound_fare_id,outbound_itinerary_id,inbound_itinerary_id,stops,has_checked_baggage,interest_free_installments,interest_free_installment_value,cart_url,short_url,status,cycle_day,cycle_state,cycle_changed_fields,cycle_state_at",
      )
      .eq("signature", row.signature)
      .maybeSingle();

    const camposMudados = anterior ? diffFare(anterior as never, row as never) : [];
    const mudou = camposMudados.length > 0;

    /** NOVA > ALTERADA > NORMAL, sempre comparando dentro do mesmo dia. */
    const jaEstavaNoCicloDeHoje = !!anterior && (anterior as { cycle_day?: string | null }).cycle_day === hoje;
    let cycleState: CycleState;
    let cycleFields: string[] = [];
    if (primeiraColetaDoDia) {
      cycleState = "unchanged"; // linha de base do dia
    } else if (!jaEstavaNoCicloDeHoje) {
      cycleState = "new";
    } else if (mudou) {
      cycleState = "changed";
      cycleFields = camposMudados;
    } else {
      // já revalidada hoje e igual: preserva um destaque anterior do mesmo dia
      const estadoAtual = (anterior as { cycle_state?: string }).cycle_state as CycleState | undefined;
      cycleState = estadoAtual === "new" || estadoAtual === "changed" ? estadoAtual : "unchanged";
      cycleFields = (((anterior as { cycle_changed_fields?: string[] }).cycle_changed_fields ?? []) as string[]).slice();
    }

    const manteveEstado =
      jaEstavaNoCicloDeHoje && !mudou && cycleState !== "unchanged"
        ? ((anterior as { cycle_state_at?: string | null }).cycle_state_at ?? new Date().toISOString())
        : new Date().toISOString();

    // promoção revalidada volta para a curadoria ativa do dia
    const payload: Record<string, unknown> = {
      ...enriquecida,
      archived_at: null,
      cycle_day: hoje,
      cycle_state: cycleState,
      cycle_changed_fields: cycleFields,
      cycle_state_at: cycleState === "unchanged" ? null : manteveEstado,
    };
    if (anterior) {
      payload.status = anterior.status;
      if (mudou) {
        payload.cart_url = null;
        payload.short_url = null;
      }
    }

    const { data: salvo, error: upErr } = await client
      .from("airfare_promotions")
      .upsert(payload, { onConflict: "signature" })
      .select("id")
      .maybeSingle();

    if (upErr) {
      saida.desfecho = "error";
      counters.error_count++;
      metrica.errors++;
      registrarTempo(cand.origin_iata, Date.now() - iniciouEm);
      registrarFalha(cand, {
        message: upErr.message,
        step: "gravacao",
        duration_ms: Date.now() - iniciouEm,
        attempts: tentativasFeitas,
      });

      await setCandidato(cand.id, {
        status: "error",
        last_error: upErr.message.slice(0, 400),
        last_error_step: "gravacao",
        last_error_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      });
      return label;
    }


    saida.desfecho = "with_fare";
    counters.validated++;
    counters.saved++;
    metrica.with_price++;
    registrarTempo(cand.origin_iata, Date.now() - iniciouEm);
    if (anterior) counters.updated_count++;
    else counters.new_count++;

    if (salvo?.id && (!anterior || mudou)) {
      try {
        await client.from("airfare_promo_price_history").insert({
          promotion_id: salvo.id,
          old_price: anterior ? Number(anterior.total_price) : null,
          new_price: viaair,
          reference_price: ref,
          reason: !anterior
            ? "nova"
            : Number(anterior.total_price) === viaair
              ? "nova_tarifa"
              : viaair < Number(anterior.total_price)
                ? "preco_caiu"
                : "preco_subiu",
          source: "coleta",
          run_id: runId,
        });
      } catch {
        /* histórico é best-effort */
      }
    }

    await setCandidato(cand.id, {
      status: "validated",
      promotion_id: salvo?.id ?? null,
      processed_at: new Date().toISOString(),
    });

    return `${label} — R$ ${viaair.toFixed(2).replace(".", ",")}`;
  };

  let processadasAgora = 0;
  let cancelada = false;

  /**
   * Cancelamento cooperativo (checado no máximo a cada 4s, para não bater no
   * banco a cada job) + AbortController que interrompe as consultas em curso.
   */
  let ultimaChecagem = 0;
  let ultimoStatusRunning = true;
  const cancelamentoPedido = async () => {
    if (Date.now() - ultimaChecagem < 1000) return !ultimoStatusRunning;
    ultimaChecagem = Date.now();
    try {
      const { data } = await client
        .from("airfare_promo_runs")
        .select("status")
        .eq("id", runId)
        .maybeSingle();
      const st = (data as { status?: string } | null)?.status;
      // "running" é o único estado que permite continuar. Qualquer outro
      // (cancel_requested/cancelada) interrompe na hora.
      ultimoStatusRunning = st === "running";
      if (!ultimoStatusRunning) {
        cancelada = true;
        abortController.abort();
      }
    } catch {
      /* falha de leitura não cancela a execução */
    }
    return !ultimoStatusRunning;
  };

  /**
   * VIGIA DE CANCELAMENTO — roda em paralelo aos workers (1x/s). Sem ele o
   * cancelamento só era percebido ENTRE candidatas, ou seja, depois de até
   * ~100s de validação em curso ("Cancelando…" preso por minutos).
   */
  const vigia = setInterval(() => {
    void cancelamentoPedido();
  }, 1000);

  /** Progresso gravado no máximo 1x/s â a UI reflete cada resultado sem inundar o banco. */
  let ultimoTouch = 0;
  const progresso = async (label: string, forcar = false) => {
    if (!forcar && Date.now() - ultimoTouch < 1000) return;
    ultimoTouch = Date.now();
    await touch({
      phase: "validando",
      processed: counters.processed,
      saved: counters.saved,
      validated: counters.validated,
      no_result: counters.no_result,
      error_count: counters.error_count,
      new_count: counters.new_count,
      updated_count: counters.updated_count,
      last_label: label,
      origin_metrics: metricasSnapshot(),
      validation_metrics: telemetria(),
    });
  };

  const contarFila = async () => {
    try {
      const { count } = await client
        .from("airfare_promo_candidates")
        .select("id", { count: "exact", head: true })
        .eq("run_id", runId)
        .eq("status", "pending");
      tele.queued = Number(count ?? 0);
    } catch {
      /* best-effort */
    }
  };
  await contarFila();

  const worker = async () => {
    while (Date.now() < deadline) {
      if (cancelada || abortController.signal.aborted || (await cancelamentoPedido())) {
        cancelada = true;
        abortController.abort();
        return;
      }
      const cand = await claimNext();
      if (!cand) return;

      tele.running++;
      tele.queued = Math.max(0, tele.queued - 1);
      const iniciou = Date.now();
      const saida: { desfecho: Desfecho; responseAt?: number; engineCalls?: number; engineMs?: number } =
        { desfecho: "error" };
      let label = "";
      try {
        // TIMEOUT INDIVIDUAL: nenhuma consulta prende um worker da fila.
        label = await withTimeout(
          processar(cand, saida),
          CANDIDATE_TIMEOUT_MS,
          "candidata",
          abortController.signal,
        );
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).slice(0, 400);
        // cancelado: não marcamos a candidata como erro nem contabilizamos
        if (abortController.signal.aborted || /^cancelado/i.test(msg)) {
          cancelada = true;
          return; // o `finally` abaixo devolve o contador de em-voo
        }
        saida.desfecho = /timeout/i.test(msg) ? "timeout" : "error";
        counters.error_count++;
        label = `${cand.origin_iata}→${cand.destination_iata}`;
        registrarFalha(cand, {
          message: msg,
          step: "fila_worker",
          duration_ms: Date.now() - iniciou,
          attempts: Number(cand.attempts ?? 0) + 1,
        });
        metricaDe(cand.origin_iata).errors++;

        await setCandidato(cand.id, {
          status: "error",
          last_error: msg,
          last_error_step: "worker",
          last_error_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        });
      } finally {
        tele.running = Math.max(0, tele.running - 1);
      }

      /* ─── LOG SIMPLES DE DIAGNÓSTICO (fila x motor) ─── */
      const finishedAt = Date.now();
      const queuedAt = cand.created_at ? new Date(cand.created_at).getTime() : iniciou;
      console.log(
        "[airfare-validacao]",
        JSON.stringify({
          rota: `${cand.origin_iata}->${cand.destination_iata}`,
          data: cand.departure_date,
          tentativa: Number(cand.attempts ?? 0) + 1,
          desfecho: saida.desfecho,
          queued_at: new Date(queuedAt).toISOString(),
          started_at: new Date(iniciou).toISOString(),
          response_at: new Date(saida.responseAt ?? finishedAt).toISOString(),
          finished_at: new Date(finishedAt).toISOString(),
          espera_fila_ms: iniciou - queuedAt,
          motor_ms: (saida.responseAt ?? finishedAt) - iniciou,
          gravacao_ms: finishedAt - (saida.responseAt ?? finishedAt),
          total_ms: finishedAt - iniciou,
          chamadas_motor: saida.engineCalls ?? 0,
          soma_chamadas_ms: saida.engineMs ?? 0,
          concorrencia: concurrency,
          em_voo: tele.running,
          fila_restante: tele.queued,
        }),
      );

      duracoes.push(Date.now() - iniciou);
      if (saida.desfecho === "requeue") {
        tele.requeued++;
        tele.queued++;
      } else {
        tele.completed++;
        if (saida.desfecho === "with_fare") tele.with_fare++;
        if (saida.desfecho === "without_fare") tele.without_fare++;
        if (saida.desfecho === "timeout") tele.timeout++;
        if (saida.desfecho === "error") tele.error++;
        counters.processed++;
        processadasAgora++;
      }
      if (cancelada || abortController.signal.aborted) return;
      await progresso(label, saida.desfecho !== "requeue");
    }
  };

  // FILA GLOBAL: os workers competem pela mesma fila, sem esperar terminar uma
  // origem para começar outra. Terminou uma validação, começa a próxima.
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    clearInterval(vigia);
  }
  if (!cancelada) await progresso("", true);

  if (cancelada) {
    // o cancelamento já encerrou a execução; aqui apenas garantimos o estado
    await finalizeCancelledRun(runId);
    return { processed: processadasAgora, remaining: 0, finished: true };
  }

  const { count: pendentes } = await client
    .from("airfare_promo_candidates")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .in("status", ["pending", "processing"]);

  const remaining = Number(pendentes ?? 0);
  if (remaining > 0) {
    await touch({ phase: "validando", origin_metrics: metricasSnapshot() });
    return { processed: processadasAgora, remaining, finished: false };
  }

  await finalizePromoRun(runId, { counters, origin_metrics: metricasSnapshot() });
  return { processed: processadasAgora, remaining: 0, finished: true };
}

/**
 * Encerra a execução: expira ofertas que sumiram e grava o estado final.
 * Reconstrói o que foi validado a partir do banco (não depende de memória),
 * então funciona mesmo quando a coleta foi feita em vários lotes.
 */
export async function finalizePromoRun(
  runId: string,
  extra?: { counters?: Record<string, number>; origin_metrics?: OriginMetrics[] },
) {
  const client = await db();

  const { data: validadas } = await client
    .from("airfare_promo_candidates")
    .select("promotion_id")
    .eq("run_id", runId)
    .eq("status", "validated")
    .not("promotion_id", "is", null);

  const ids = [...new Set(((validadas ?? []) as Array<{ promotion_id: string }>).map((c) => c.promotion_id))];
  const assinaturasValidadas = new Set<string>();
  const oportunidadesTocadas = new Set<string>();

  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await client
      .from("airfare_promotions")
      .select("signature,origin_iata,destination_iata,departure_date")
      .in("id", ids.slice(i, i + 200));
    for (const p of (data ?? []) as Array<{
      signature: string;
      origin_iata: string;
      destination_iata: string;
      departure_date: string;
    }>) {
      assinaturasValidadas.add(p.signature);
      oportunidadesTocadas.add(opportunityKey(p));
    }
  }

  let expired = 0;
  for (const chave of oportunidadesTocadas) {
    const [origem, destino, ida] = chave.split("|");
    try {
      const { data: antigas } = await client
        .from("airfare_promotions")
        .select("id,signature,total_price")
        .eq("origin_iata", origem)
        .eq("destination_iata", destino)
        .eq("departure_date", ida)
        .eq("fare_status", "valida");
      for (const p of (antigas ?? []) as Array<{ id: string; signature: string; total_price: number }>) {
        if (assinaturasValidadas.has(p.signature)) continue;
        await client
          .from("airfare_promotions")
          .update({
            fare_status: "indisponivel",
            unavailable_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
            cart_url: null,
            short_url: null,
          })
          .eq("id", p.id);
        expired++;
        try {
          await client.from("airfare_promo_price_history").insert({
            promotion_id: p.id,
            old_price: p.total_price,
            new_price: null,
            reason: "indisponivel",
            source: "coleta",
            run_id: runId,
          });
        } catch {
          /* best-effort */
        }
      }
    } catch {
      /* expiração é best-effort */
    }
  }

  const erros = Number(extra?.counters?.["error_count"] ?? 0);
  await client
    .from("airfare_promo_runs")
    .update({
      ...(extra?.counters ?? {}),
      ...(extra?.origin_metrics ? { origin_metrics: extra.origin_metrics } : {}),
      status: "done",
      phase: erros > 0 ? "concluida_com_erros" : "concluida",
      expired_count: expired,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

/**
 * Encerra de fato uma execução cancelada (libera a trava global).
 * Nada do que já foi validado é apagado.
 */
export async function finalizeCancelledRun(runId: string) {
  const client = await db();
  const now = new Date().toISOString();
  await client
    .from("airfare_promo_candidates")
    .update({ status: "cancelled", processed_at: now })
    .eq("run_id", runId)
    .in("status", ["pending", "processing"]);
  await client
    .from("airfare_promo_runs")
    .update({
      status: "cancelada",
      phase: "cancelada",
      cancelled_at: now,
      finished_at: now,
      updated_at: now,
    })
    .eq("id", runId);
  return { cancelled: true as const, at: now };
}

/** Descoberta parada por mais que isso é retomada pelo worker (heartbeat = 20s). */
const DISCOVERY_STALE_MS = 90 * 1000;


/**
 * Retoma qualquer execução em andamento (chamado pelo cron a cada minuto).
 * Também retoma a DESCOBERTA quando a invocação que a iniciou morreu,
 * e conclui execuções com cancelamento pedido.
 */
export async function resumeActiveRun(budgetMs = WORKER_BUDGET_MS) {
  const client = await db();
  const { data: run } = await client
    .from("airfare_promo_runs")
    .select("id,phase,status,updated_at")
    .in("status", ["running", "cancel_requested"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return { resumed: false as const, reason: "sem_coleta_ativa" };

  const { count } = await client
    .from("airfare_promo_candidates")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .in("status", ["pending", "processing"]);

  const pendentes = Number(count ?? 0);
  const parada = Date.now() - new Date(run.updated_at).getTime();

  if (run.status === "cancel_requested") {
    if (pendentes === 0 || parada > CLAIM_STALE_MS) {
      await finalizeCancelledRun(run.id);
      return { resumed: false as const, reason: "cancelada" };
    }
    return { resumed: false as const, reason: "cancelando" };
  }

  if (pendentes === 0) {
    if (run.phase === "descobrindo") {
      // a descoberta ainda está viva (heartbeat recente): não interferir
      if (parada < DISCOVERY_STALE_MS) {
        return { resumed: false as const, reason: "descobrindo" };
      }
      // a invocação que fazia a descoberta morreu: refazer aqui, no backend
      const { collectAirfarePromotions } = await import("@/lib/airfare-promos.server");
      const res = await collectAirfarePromotions({ runId: run.id, budgetMs });
      return { resumed: true as const, runId: run.id, reason: "descoberta_retomada", ...res };
    }
    if (parada < RUN_STALE_MS && run.phase === "validando") {
      // lote em andamento em outra invocação
      if (parada < 90_000) return { resumed: false as const, reason: "validando" };
    }
    await finalizePromoRun(run.id);
    return { resumed: false as const, reason: "finalizada" };
  }

  // LEASE: com orçamento de vários minutos, o cron de 1 minuto dispararia
  // invocações sobrepostas e multiplicaria a carga no motor. Só uma invocação
  // por vez segura o lease; as demais retornam sem trabalho.
  const agora = Date.now();
  const leaseAte = new Date(agora + budgetMs + WORKER_LEASE_SLACK_MS).toISOString();
  const { data: lease } = await client
    .from("airfare_promo_runs")
    .update({ worker_lease_until: leaseAte })
    .eq("id", run.id)
    .or(`worker_lease_until.is.null,worker_lease_until.lt.${new Date(agora).toISOString()}`)
    .select("id");
  if (!lease || lease.length === 0) {
    return { resumed: false as const, reason: "worker_em_execucao" };
  }

  try {
    const res = await processPendingCandidates({ runId: run.id, budgetMs });
    return { resumed: true as const, runId: run.id, ...res };
  } finally {
    await client
      .from("airfare_promo_runs")
      .update({ worker_lease_until: null })
      .eq("id", run.id)
      .then(
        () => undefined,
        () => undefined,
      );
  }
}


/**
 * REGRA DA MEIA-NOITE (00:00 BRT) — zera a curadoria ativa.
 *
 * As promoções do dia são arquivadas (histórico preservado: nada é apagado)
 * e a tela volta a ZERO até a coleta das 06:00. Roda 100% no backend.
 */
export async function closeDailyCuration() {
  const client = await db();
  const now = new Date().toISOString();

  const arquivadas = await archivePromotions(client, now, "ciclo_encerrado", null);

  // encerra qualquer execução travada para o próximo ciclo começar limpo
  await client
    .from("airfare_promo_runs")
    .update({ status: "cancelada", finished_at: now, updated_at: now })
    .eq("status", "running");

  return { archived: arquivadas, at: now };
}

/** Dia da curadoria (fuso de Brasília) no formato YYYY-MM-DD. */
export function curationDayBRT(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Arquiva promoções ativas (todas, ou só as anteriores a `beforeDay`). */
async function archivePromotions(
  client: AnyClient,
  now: string,
  reason: string,
  beforeDay: string | null,
): Promise<number> {
  let sel = client
    .from("airfare_promotions")
    .select("id,cycle_day,quoted_at,created_at")
    .is("archived_at", null);
  if (beforeDay) sel = sel.or(`cycle_day.is.null,cycle_day.lt.${beforeDay}`);
  const { data } = await sel;
  const rows = (data ?? []) as Array<{
    id: string;
    cycle_day: string | null;
    quoted_at: string | null;
    created_at: string | null;
  }>;
  if (!rows.length) return 0;

  // agrupa por dia de curadoria para preservar a data original no histórico
  // (sem cycle_day, usa a data da cotação como referência do ciclo)
  const porDia = new Map<string | null, string[]>();
  for (const r of rows) {
    const base = r.quoted_at ?? r.created_at;
    const k = r.cycle_day ?? (base ? curationDayBRT(new Date(base)) : null);
    porDia.set(k, [...(porDia.get(k) ?? []), r.id]);
  }
  let ok = 0;
  for (const [dia, ids] of porDia) {
    const { error } = await client
      .from("airfare_promotions")
      .update({
        archived_at: now,
        archived_reason: reason,
        archived_cycle_day: dia,
        fare_status: "expirada",
        cycle_state: "unchanged",
        cycle_changed_fields: [],
        cycle_state_at: null,
        cycle_day: null,
      })
      .in("id", ids);
    if (error) console.error("[promos] falha ao arquivar lote", dia, error.message);
    else ok += ids.length;
  }
  return ok;
}

/**
 * SANEAMENTO (também usado retroativamente): qualquer promoção ativa que
 * pertença a um dia anterior vai para os Arquivados. Serve de rede de
 * segurança caso o cron das 00:00 falhe.
 */
export async function archiveStalePromotions(reason = "ciclo_anterior") {
  const client = await db();
  const now = new Date().toISOString();
  const hoje = curationDayBRT();
  const archived = await archivePromotions(client, now, reason, hoje);
  return { archived, day: hoje, at: now };
}

/** Retenção do histórico de arquivados, em dias. */
export const ARCHIVE_RETENTION_DAYS = 30;

/**
 * LIMPEZA AUTOMÁTICA (job diário): remove definitivamente o que passou dos
 * 30 dias de retenção. O histórico de preço cai por CASCADE; as candidatas
 * ficam com `promotion_id` nulo (SET NULL) e são removidas quando antigas.
 * Execuções antigas só são apagadas se nenhuma promoção viva depender delas.
 */
export async function cleanupArchivedPromotions() {
  const client = await db();
  const limite = new Date(Date.now() - ARCHIVE_RETENTION_DAYS * 86400_000).toISOString();

  const { data: velhas } = await client
    .from("airfare_promotions")
    .select("id")
    .not("archived_at", "is", null)
    .lt("archived_at", limite);
  const ids = ((velhas ?? []) as Array<{ id: string }>).map((r) => r.id);

  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const { error } = await client.from("airfare_promotions").delete().in("id", lote);
    if (!error) deleted += lote.length;
  }

  // candidatas antigas que não pertencem mais a nenhuma promoção viva
  const { data: candRemovidas } = await client
    .from("airfare_promo_candidates")
    .delete()
    .lt("created_at", limite)
    .is("promotion_id", null)
    .select("id");
  const candidatesDeleted = ((candRemovidas ?? []) as Array<{ id: string }>).length;

  // execuções antigas já finalizadas e sem promoção viva apontando para elas
  const { data: vivas } = await client
    .from("airfare_promotions")
    .select("last_run_id")
    .not("last_run_id", "is", null);
  const emUso = new Set(
    ((vivas ?? []) as Array<{ last_run_id: string | null }>)
      .map((r) => r.last_run_id)
      .filter(Boolean) as string[],
  );
  const { data: runsVelhas } = await client
    .from("airfare_promo_runs")
    .select("id")
    .not("finished_at", "is", null)
    .lt("finished_at", limite);
  const runIds = ((runsVelhas ?? []) as Array<{ id: string }>)
    .map((r) => r.id)
    .filter((id) => !emUso.has(id));
  let runsDeleted = 0;
  for (let i = 0; i < runIds.length; i += 100) {
    const lote = runIds.slice(i, i + 100);
    const { error } = await client.from("airfare_promo_runs").delete().in("id", lote);
    if (!error) runsDeleted += lote.length;
  }

  const { count: retidas } = await client
    .from("airfare_promotions")
    .select("id", { count: "exact", head: true })
    .not("archived_at", "is", null);

  return {
    deleted,
    candidatesDeleted,
    runsDeleted,
    retained: retidas ?? 0,
    retentionDays: ARCHIVE_RETENTION_DAYS,
    cutoff: limite,
  };
}

/**
 * ROTINA RETROATIVA: arquiva o que ficou ativo de dias anteriores e aplica a
 * limpeza dos 30 dias na base já existente. Devolve as métricas do saneamento.
 */
export async function sanitizeArchiveCycle() {
  const client = await db();
  const hoje = curationDayBRT();

  const { count: antesAtivasAntigas } = await client
    .from("airfare_promotions")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null)
    .or(`cycle_day.is.null,cycle_day.lt.${hoje}`);

  const arquivamento = await archiveStalePromotions("saneamento_retroativo");
  const limpeza = await cleanupArchivedPromotions();

  const { count: ativas } = await client
    .from("airfare_promotions")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);

  return {
    day: hoje,
    activeStaleFound: antesAtivasAntigas ?? 0,
    archivedNow: arquivamento.archived,
    archivedKept: limpeza.retained,
    archivedDeleted: limpeza.deleted,
    candidatesDeleted: limpeza.candidatesDeleted,
    runsDeleted: limpeza.runsDeleted,
    activeAfter: ativas ?? 0,
  };
}
