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

/** Orçamento de tempo por invocação (deixa folga para o runtime serverless). */
export const WORKER_BUDGET_MS = 55_000;

/** Candidata presa em `processing` volta para a fila depois disso. */
const CLAIM_STALE_MS = 6 * 60 * 1000;

/** Execução sem nenhuma atualização por esse tempo é considerada travada. */
export const RUN_STALE_MS = 45 * 60 * 1000;

const RETRY_DELAYS_MS = [1500, 5000];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type CandidateRow = {
  id: string;
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
};

const CANDIDATE_COLS =
  "id,signature,scope,origin_iata,origin_city,destination_iata,destination_city,departure_date,return_date,reference_source,reference_price,reference_origin,reference_destination,reference_departure_date,reference_return_date,reference_collected_at";

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
  const { PROMO_VALIDATION_CONCURRENCY } = await import("@/lib/airfare-promos.config");
  const runId = args.runId;
  const deadline = Date.now() + (args.budgetMs ?? WORKER_BUDGET_MS);
  const concurrency = Math.min(Math.max(args.concurrency ?? PROMO_VALIDATION_CONCURRENCY, 1), 4);

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

  const processar = async (cand: CandidateRow) => {
    const iniciouEm = Date.now();
    const metrica = metricaDe(cand.origin_iata);
    metrica.validated++;
    const label = `${cand.destination_city ?? cand.destination_iata} (${cand.origin_iata}→${cand.destination_iata})`;

    let row: ReturnType<typeof buildPromotionRow> | null = null;
    let ultimoErro: unknown = null;

    for (let tentativa = 0; tentativa <= RETRY_DELAYS_MS.length; tentativa++) {
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
        });
        ultimoErro = null;
        break;
      } catch (err) {
        ultimoErro = err;
        row = null;
        if (tentativa < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[tentativa]!);
      }
    }

    if (ultimoErro) {
      counters.error_count++;
      metrica.errors++;
      registrarTempo(cand.origin_iata, Date.now() - iniciouEm);
      await setCandidato(cand.id, {
        status: "error",
        attempts: RETRY_DELAYS_MS.length + 1,
        last_error: (ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)).slice(0, 400),
        last_error_step: "motor_viaair",
        last_error_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      });
      return label;
    }

    if (!row) {
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
      counters.error_count++;
      metrica.errors++;
      registrarTempo(cand.origin_iata, Date.now() - iniciouEm);
      await setCandidato(cand.id, {
        status: "error",
        last_error: upErr.message.slice(0, 400),
        last_error_step: "gravacao",
        last_error_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      });
      return label;
    }


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

  /** Cancelamento cooperativo: consultado ANTES de reivindicar cada candidata. */
  const cancelamentoPedido = async () => {
    try {
      const { data } = await client
        .from("airfare_promo_runs")
        .select("status")
        .eq("id", runId)
        .maybeSingle();
      const st = (data as { status?: string } | null)?.status;
      return !st || st !== "running";
    } catch {
      return false;
    }
  };

  const worker = async () => {
    while (Date.now() < deadline) {
      if (cancelada || (await cancelamentoPedido())) {
        cancelada = true;
        return;
      }
      const cand = await claimNext();
      if (!cand) return;
      let label = "";
      try {
        // nenhuma consulta ao motor pode prender a coleta indefinidamente
        label = await withTimeout(processar(cand), CANDIDATE_TIMEOUT_MS, "candidata");
      } catch (err) {
        counters.error_count++;
        label = `${cand.origin_iata}→${cand.destination_iata}`;
        await setCandidato(cand.id, {
          status: "error",
          last_error: (err instanceof Error ? err.message : String(err)).slice(0, 400),
          last_error_step: "worker",
          last_error_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        });
      }
      counters.processed++;
      processadasAgora++;
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
      });
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

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
 * Retoma qualquer execução em andamento (chamado pelo cron a cada minuto).
 * Se a execução estiver parada há muito tempo sem candidatas pendentes,
 * é encerrada para não travar a próxima coleta.
 */
export async function resumeActiveRun(budgetMs = WORKER_BUDGET_MS) {
  const client = await db();
  const { data: run } = await client
    .from("airfare_promo_runs")
    .select("id,phase,updated_at")
    .eq("status", "running")
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

  if (pendentes === 0) {
    // fase de descoberta ainda rodando: não interferir
    if (run.phase === "descobrindo" && parada < RUN_STALE_MS) {
      return { resumed: false as const, reason: "descobrindo" };
    }
    await finalizePromoRun(run.id);
    return { resumed: false as const, reason: "finalizada" };
  }

  const res = await processPendingCandidates({ runId: run.id, budgetMs });
  return { resumed: true as const, runId: run.id, ...res };
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

  const { data: ativas } = await client
    .from("airfare_promotions")
    .select("id")
    .is("archived_at", null);

  const ids = ((ativas ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    await client
      .from("airfare_promotions")
      .update({
        archived_at: now,
        fare_status: "ciclo_encerrado",
        cycle_state: "unchanged",
        cycle_changed_fields: [],
        cycle_state_at: null,
        cycle_day: null,
      })

      .in("id", ids);
  }

  // encerra qualquer execução travada para o próximo ciclo começar limpo
  await client
    .from("airfare_promo_runs")
    .update({ status: "cancelada", finished_at: now, updated_at: now })
    .eq("status", "running");

  return { archived: ids.length, at: now };
}
