/**
 * Coleta e curadoria das PROMOÇÕES DE AÉREO.
 *
 * Pesquisa as rotas prioritárias no NOSSO motor (Oner/Comprar Viagem),
 * escolhe a melhor oportunidade de cada rota/data e grava em
 * `airfare_promotions` já com as condições comerciais calculadas pela fonte
 * única (`airfare-conditions.ts`): melhor condição sem juros (regra da cia)
 * e parcelamento estendido de 5x a 12x com o markup cadastrado.
 */
import {
  DEFAULT_EXTENDED_MARKUPS,
  buildExtendedQuotes,
  getAirfarePaymentConditions,
  quotesToExtendedOptions,
  type MarkupTable,
} from "@/lib/airfare-conditions";
import type { OriginMetrics } from "@/lib/airfare-promos.config";
import { searchFlights, searchInboundFlights } from "@/lib/onertravel.server";
import { flightHasBaggage, type OnerFlight } from "@/lib/onertravel.types";

type AnyClient = { from: (t: string) => any };

export type PromoRoute = {
  id: string;
  origin_iata: string;
  origin_city: string | null;
  destination_iata: string;
  destination_city: string | null;
  scope: "nacional" | "internacional";
  priority: number;
};

/** Markups vindos do banco (fonte editável); cai no default se vazio. */
export async function loadMarkups(supabase: AnyClient): Promise<MarkupTable> {
  const { data, error } = await supabase
    .from("airfare_installment_markups")
    .select("installments,markup_percent,active")
    .eq("active", true);
  if (error || !data?.length) return DEFAULT_EXTENDED_MARKUPS;
  const table: MarkupTable = {};
  for (const row of data as Array<{ installments: number; markup_percent: number | string }>) {
    table[Number(row.installments)] = Number(row.markup_percent);
  }
  return Object.keys(table).length ? table : DEFAULT_EXTENDED_MARKUPS;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Datas pesquisadas por rota: saídas futuras com 7 noites. */
export function defaultDatePairs(offsets = [45, 75]): Array<{ departureDate: string; returnDate: string }> {
  const base = new Date();
  return offsets.map((off) => {
    const out = new Date(base);
    out.setDate(out.getDate() + off);
    const back = new Date(out);
    back.setDate(back.getDate() + 7);
    return { departureDate: iso(out), returnDate: iso(back) };
  });
}

function airlineOf(f: OnerFlight) {
  return f.journey?.marketingAirline ?? f.journey?.segments?.[0]?.marketingAirline;
}

export function promoSignature(p: {
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string | null;
  airline_iata: string | null;
}): string {
  return [p.origin_iata, p.destination_iata, p.departure_date, p.return_date ?? "-", p.airline_iata ?? "-"]
    .join("|")
    .toUpperCase();
}

/** Monta a linha da promoção (sem gravar) a partir dos voos escolhidos. */
export function buildPromotionRow(args: {
  route: PromoRoute;
  searchKey: string;
  out: OnerFlight;
  inb: OnerFlight | null;
  departureDate: string;
  returnDate: string | null;
  markups: MarkupTable;
}) {
  const { route, out, inb, markups } = args;
  const passengers = out.price.passengerCount || 1;
  const total = (out.price.total ?? 0) + (inb?.price.total ?? 0);
  const fare = (out.price.price ?? 0) + (inb?.price.price ?? 0);
  const taxes = Math.max(0, total - fare);

  const air = airlineOf(out);
  const airIn = inb ? airlineOf(inb) : null;

  const quotes = buildExtendedQuotes(total, markups);
  const extendedOptions = quotesToExtendedOptions(quotes);

  const condOut = getAirfarePaymentConditions({ total, passengers, airline: air, extendedOptions });
  const condIn = airIn
    ? getAirfarePaymentConditions({ total, passengers, airline: airIn, extendedOptions })
    : null;
  const cond =
    condIn && condIn.interestFree.installments < condOut.interestFree.installments ? condIn : condOut;

  const q12 = quotes.find((q) => q.installments === 12) ?? quotes[quotes.length - 1] ?? null;

  const row = {
    signature: promoSignature({
      origin_iata: route.origin_iata,
      destination_iata: route.destination_iata,
      departure_date: args.departureDate,
      return_date: args.returnDate,
      airline_iata: air?.iata ?? null,
    }),
    scope: route.scope,
    origin_iata: route.origin_iata,
    origin_city: route.origin_city,
    destination_iata: route.destination_iata,
    destination_city: route.destination_city,
    airline_iata: air?.iata ?? null,
    airline_name: air?.name ?? null,
    airline_logo: air?.pathLogo ?? null,
    departure_date: args.departureDate,
    return_date: args.returnDate,
    is_round_trip: !!inb,
    stops: out.journey?.numberOfStops ?? 0,
    has_checked_baggage: flightHasBaggage(out) && (!inb || flightHasBaggage(inb)),
    cabin_class: out.journey?.fareClass?.cabinClass ?? null,
    passengers,
    fare_price: Number(fare.toFixed(2)),
    taxes: Number(taxes.toFixed(2)),
    total_price: Number(total.toFixed(2)),
    price_per_passenger: Number((total / passengers).toFixed(2)),
    interest_free_installments: cond.interestFree.installments,
    interest_free_installment_value: Number(cond.interestFree.installmentValue.toFixed(2)),
    airline_rule: JSON.parse(JSON.stringify(cond.airlineRule)) as unknown,
    extended_max_installments: q12?.installments ?? null,
    extended_installment_value_12x: q12 ? Number(q12.installmentValue.toFixed(2)) : null,
    extended_markup_12x: q12 ? Number(q12.markupPercent.toFixed(4)) : null,
    extended_total_12x: q12 ? Number(q12.total.toFixed(2)) : null,
    extended_options: quotes.map((q) => ({
      installments: q.installments,
      markup_percent: Number(q.markupPercent.toFixed(4)),
      total: Number(q.total.toFixed(2)),
      installment_value: Number(q.installmentValue.toFixed(2)),
    })),
    search_key: args.searchKey,
    outbound_fare_id: out.key,
    outbound_itinerary_id: out.journey?.key ?? null,
    inbound_fare_id: inb?.key ?? null,
    inbound_itinerary_id: inb?.journey?.key ?? null,
    fare_status: "valida" as const,
    quoted_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  };
  return row;
}

/** Pesquisa uma rota/data e devolve a melhor oportunidade (ou null). */
export async function quoteRoute(args: {
  route: PromoRoute;
  departureDate: string;
  returnDate: string | null;
  markups: MarkupTable;
  adults?: number;
}) {
  const { route, departureDate, returnDate } = args;
  const base = {
    departureIata: route.origin_iata,
    arrivalIata: route.destination_iata,
    departureDate,
    adults: args.adults ?? 1,
    children: 0,
    infants: 0,
    pageSize: 20,
    departureIsCity: false,
    arrivalIsCity: false,
    filters: {
      containsDispatchBaggage: false,
      maxStops: 2,
      startPrice: null,
      endPrice: null,
      departureFrom: null,
      departureTo: null,
      airlineIatas: [],
      cabinClass: null,
    },
  };

  const res = await searchFlights({ ...base, returnDate } as never);
  const out = [...(res.outbound?.flights ?? [])].sort((a, b) => a.price.total - b.price.total)[0];
  if (!out) return null;

  let inb: OnerFlight | null = null;
  if (returnDate) {
    try {
      const back = await searchInboundFlights({
        ...base,
        returnDate,
        searchKey: res.searchKey,
        flightKey: out.key,
      } as never);
      inb =
        [...(back.flights ?? [])].sort((a, b) => a.price.total - b.price.total)[0] ?? null;
    } catch {
      inb = null;
    }
  }

  return buildPromotionRow({
    route,
    searchKey: res.searchKey,
    out,
    inb,
    departureDate,
    returnDate: inb ? returnDate : null,
    markups: args.markups,
  });
}

/** Considera travada/abandonada uma execução parada há mais de 45 minutos. */
const RUN_STALE_MS = 45 * 60 * 1000;

/** Cria a execução (trava global). Devolve null se já existe uma ativa. */
export async function startPromoRun(trigger: "manual" | "cron"): Promise<{ id: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as AnyClient;

  const { data: active } = await db
    .from("airfare_promo_runs")
    .select("id,updated_at")
    .eq("status", "running")
    .maybeSingle();

  if (active) {
    const idle = Date.now() - new Date(active.updated_at).getTime();
    if (idle < RUN_STALE_MS) return null;
    await db
      .from("airfare_promo_runs")
      .update({
        status: "error",
        error_message: "Execução interrompida (sem atualização)",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id);
  }

  const { data, error } = await db
    .from("airfare_promo_runs")
    .insert({ status: "running", trigger })
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string };
}

export async function failPromoRun(runId: string, message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as unknown as AnyClient)
    .from("airfare_promo_runs")
    .update({
      status: "error",
      error_message: message.slice(0, 500),
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

type CandidateRow = {
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

const RETRY_DELAYS_MS = [1500, 5000];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Chave da oportunidade (sem companhia) — usada no ciclo de vida/expiração. */
function opportunityKey(p: { origin_iata: string; destination_iata: string; departure_date: string }) {
  return `${p.origin_iata}|${p.destination_iata}|${p.departure_date}`.toUpperCase();
}

/**
 * Coleta completa:
 *   Melhores Destinos (radar) → candidatas normalizadas → fila →
 *   pool de 3 validações no motor VIA AIR → gravação imediata →
 *   comparativo MD × VIA AIR → expiração das ofertas que sumiram.
 *
 * O preço publicado é SEMPRE o do motor VIA AIR; o preço do Melhores
 * Destinos fica guardado apenas como referência interna.
 */
export async function collectAirfarePromotions(opts?: {
  runId?: string;
  maxCandidates?: number;
  concurrency?: number;
  /** compatibilidade com chamadas antigas (limite de sementes monitoradas) */
  maxRoutes?: number;
  routeIds?: string[];
  offsets?: number[];
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { discoverCandidates, candidateSignature, fallbackDatePairs } = await import(
    "@/lib/airfare-promos.discovery.server"
  );
  const { PROMO_VALIDATION_CONCURRENCY } = await import("@/lib/airfare-promos.config");
  type Metrics = OriginMetrics;
  const db = supabaseAdmin as unknown as AnyClient;
  const markups = await loadMarkups(db);
  const runId = opts?.runId;
  const concurrency = Math.min(
    Math.max(opts?.concurrency ?? PROMO_VALIDATION_CONCURRENCY, 1),
    4,
  );
  const startedAt = new Date().toISOString();

  const counters = {
    discovered: 0,
    processed: 0,
    validated: 0,
    saved: 0,
    no_result: 0,
    error_count: 0,
    new_count: 0,
    updated_count: 0,
    expired_count: 0,
  };

  const touch = async (patch: Record<string, unknown>) => {
    if (!runId) return;
    try {
      await db
        .from("airfare_promo_runs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", runId);
    } catch {
      /* progresso é best-effort */
    }
  };

  await touch({ phase: "descobrindo", total: 0, processed: 0, saved: 0 });

  // 1) RADAR: oportunidades do Melhores Destinos (descoberta ilimitada,
  //    seleção de até N por origem — ver airfare-promos.config.ts)
  const descoberta = await discoverCandidates({ maxCandidates: opts?.maxCandidates ?? 600 });
  const candidatas = descoberta.candidates;
  const metricasPorOrigem = new Map<string, Metrics>(
    descoberta.metrics.map((m) => [m.origin, { ...m }]),
  );
  const temposPorOrigem = new Map<string, number[]>();
  const porAssinatura = new Map(candidatas.map((c) => [c.signature, c]));


  // 2) FALLBACK: rotas monitoradas manualmente (complementares, nunca a fonte única)
  try {
    let q = db
      .from("airfare_promo_routes")
      .select("id,origin_iata,origin_city,destination_iata,destination_city,scope,priority")
      .eq("active", true)
      .order("priority", { ascending: true });
    if (opts?.routeIds?.length) q = q.in("id", opts.routeIds);
    const { data: rotas } = await q;
    for (const r of ((rotas ?? []) as PromoRoute[]).slice(0, opts?.maxRoutes ?? 14)) {
      for (const par of fallbackDatePairs(opts?.offsets)) {
        const sig = candidateSignature({
          origin_iata: r.origin_iata,
          destination_iata: r.destination_iata,
          departure_date: par.departureDate,
          return_date: par.returnDate,
        });
        if (porAssinatura.has(sig)) continue;
        porAssinatura.set(sig, {
          signature: sig,
          scope: r.scope,
          origin_iata: r.origin_iata,
          origin_city: r.origin_city,
          destination_iata: r.destination_iata,
          destination_city: r.destination_city,
          departure_date: par.departureDate,
          return_date: par.returnDate,
          priority: 200 + (r.priority ?? 0),
          reference_source: "rota_monitorada",
          reference_price: null,
          reference_origin: r.origin_iata,
          reference_destination: r.destination_iata,
          reference_departure_date: null,
          reference_return_date: null,
          reference_collected_at: new Date().toISOString(),
        });
      }
    }
  } catch {
    /* sementes são complementares */
  }

  const fila = [...porAssinatura.values()].sort((a, b) => a.priority - b.priority);
  counters.discovered = fila.length;

  // 3) grava a fila (status pending) e recupera os ids
  let queued: CandidateRow[] = [];
  if (runId && fila.length) {
    const { data } = await db
      .from("airfare_promo_candidates")
      .upsert(
        fila.map((c) => ({ ...c, run_id: runId, status: "pending" })),
        { onConflict: "run_id,signature" },
      )
      .select(
        "id,signature,scope,origin_iata,origin_city,destination_iata,destination_city,departure_date,return_date,reference_source,reference_price,reference_origin,reference_destination,reference_departure_date,reference_return_date,reference_collected_at",
      );
    queued = (data ?? []) as CandidateRow[];
  }
  if (!queued.length) {
    queued = fila.map((c, i) => ({ ...c, id: `mem-${i}` })) as unknown as CandidateRow[];
  }

  await touch({
    phase: "validando",
    total: queued.length,
    discovered: counters.discovered,
    processed: 0,
    saved: 0,
  });

  const setCandidato = async (id: string, patch: Record<string, unknown>) => {
    if (!runId || id.startsWith("mem-")) return;
    try {
      await db.from("airfare_promo_candidates").update(patch).eq("id", id);
    } catch {
      /* best-effort */
    }
  };

  const metricaDe = (origem: string): Metrics => {
    let m = metricasPorOrigem.get(origem);
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
      metricasPorOrigem.set(origem, m);
    }
    return m;
  };

  const registrarTempo = (origem: string, ms: number) => {
    const lista = temposPorOrigem.get(origem) ?? [];
    lista.push(ms);
    temposPorOrigem.set(origem, lista);
    const m = metricaDe(origem);
    m.avg_seconds = Number((lista.reduce((a, b) => a + b, 0) / lista.length / 1000).toFixed(1));
  };

  const metricasSnapshot = () =>
    [...metricasPorOrigem.values()].sort((a, b) => a.origin.localeCompare(b.origin));

  const assinaturasValidadas = new Set<string>();
  const oportunidadesTocadas = new Set<string>();

  const processar = async (cand: CandidateRow) => {
    const iniciouEm = Date.now();
    const metrica = metricaDe(cand.origin_iata);
    metrica.validated++;
    const label = `${cand.destination_city ?? cand.destination_iata} (${cand.origin_iata}→${cand.destination_iata})`;
    await setCandidato(cand.id, { status: "processing" });

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
      last_run_id: runId ?? null,
      unavailable_at: null,
      fare_status: "valida" as const,
    };

    // estado anterior (histórico + invalidação de link)
    const { data: anterior } = await db
      .from("airfare_promotions")
      .select("id,total_price,airline_iata,outbound_fare_id,cart_url,short_url,status")
      .eq("signature", row.signature)
      .maybeSingle();

    const mudou =
      !!anterior &&
      (Number(anterior.total_price) !== viaair ||
        anterior.airline_iata !== row.airline_iata ||
        anterior.outbound_fare_id !== row.outbound_fare_id);

    const payload: Record<string, unknown> = { ...enriquecida };
    if (anterior) {
      payload.status = anterior.status;
      if (mudou) {
        payload.cart_url = null;
        payload.short_url = null;
      }
    }

    const { data: salvo, error: upErr } = await db
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
    assinaturasValidadas.add(row.signature);
    oportunidadesTocadas.add(opportunityKey(row));

    if (salvo?.id && (!anterior || mudou)) {
      try {
        await db.from("airfare_promo_price_history").insert({
          promotion_id: salvo.id,
          old_price: anterior ? Number(anterior.total_price) : null,
          new_price: viaair,
          reference_price: ref,
          reason: !anterior ? "nova" : Number(anterior.total_price) === viaair ? "nova_tarifa" : viaair < Number(anterior.total_price) ? "preco_caiu" : "preco_subiu",
          source: "coleta",
          run_id: runId ?? null,
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

  // 4) pool com concorrência controlada (3 simultâneas)
  let cursor = 0;
  const worker = async () => {
    while (cursor < queued.length) {
      const cand = queued[cursor++]!;
      let label = "";
      try {
        label = await processar(cand);
      } catch (err) {
        counters.error_count++;
        label = `${cand.origin_iata}→${cand.destination_iata}`;
        await setCandidato(cand.id, {
          status: "error",
          last_error: (err instanceof Error ? err.message : String(err)).slice(0, 400),
          last_error_step: "worker",
          last_error_at: new Date().toISOString(),
        });
      }
      counters.processed++;
      await touch({
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

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } catch (err) {
    if (runId) await failPromoRun(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }

  // 5) ciclo de vida: oportunidade revalidada, mas oferta antiga (ex.: outra
  // companhia) não reencontrada → marca como indisponível, sem apagar.
  await touch({ phase: "expirando" });
  for (const chave of oportunidadesTocadas) {
    const [origem, destino, ida] = chave.split("|");
    try {
      const { data: antigas } = await db
        .from("airfare_promotions")
        .select("id,signature,total_price")
        .eq("origin_iata", origem)
        .eq("destination_iata", destino)
        .eq("departure_date", ida)
        .eq("fare_status", "valida");
      for (const p of (antigas ?? []) as Array<{ id: string; signature: string; total_price: number }>) {
        if (assinaturasValidadas.has(p.signature)) continue;
        await db
          .from("airfare_promotions")
          .update({
            fare_status: "indisponivel",
            unavailable_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
            cart_url: null,
            short_url: null,
          })
          .eq("id", p.id);
        counters.expired_count++;
        try {
          await db.from("airfare_promo_price_history").insert({
            promotion_id: p.id,
            old_price: p.total_price,
            new_price: null,
            reason: "indisponivel",
            source: "coleta",
            run_id: runId ?? null,
          });
        } catch {
          /* best-effort */
        }
      }
    } catch {
      /* expiração é best-effort */
    }
  }

  await touch({
    status: "done",
    phase: "concluida",
    discovered: counters.discovered,
    processed: counters.processed,
    saved: counters.saved,
    validated: counters.validated,
    no_result: counters.no_result,
    error_count: counters.error_count,
    new_count: counters.new_count,
    updated_count: counters.updated_count,
    expired_count: counters.expired_count,
    origin_metrics: metricasSnapshot(),
    deduped: descoberta.dedupedTotal,
    finished_at: new Date().toISOString(),
  });

  return { startedAt, ...counters, origin_metrics: metricasSnapshot() };
}


