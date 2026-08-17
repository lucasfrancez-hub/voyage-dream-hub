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
import { isMetroCode, resolveCity } from "@/lib/iata-lookup";
import { encodePicks } from "@/lib/multicity";

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

/** Assinatura leve do voo (cia + horário de partida) usada na pré-seleção do motor. */
function horaPick(f: OnerFlight | null, airline: string | null) {
  const t = f?.journey?.departure?.time ?? f?.journey?.segments?.[0]?.departure?.time ?? null;
  const hora = t
    ? `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`
    : null;
  return { airline: airline ?? null, time: hora };
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

/**
 * DIFERENÇA MÍNIMA PARA VIRAR MULTI-TRECHO (somente voos NACIONAIS).
 *
 * Regra comercial: ida e volta na MESMA companhia é sempre a preferida.
 * Só quando misturar companhias economiza pelo menos este valor a viagem
 * é vendida como multi-trecho (cada trecho comprado separadamente no motor).
 */
export const MULTI_LEG_MIN_DIFF = 100;

/**
 * Link do motor VIA AIR já aberto em multi-trecho, com o voo de CADA trecho
 * pré-selecionado (`ps`) — o cliente cai direto no carrinho da viagem, sem
 * precisar escolher ida e volta de novo.
 */
export function multiLegSearchUrl(args: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  adults?: number;
  picks?: { airline: string | null; time: string | null }[];
}): string {
  const o = args.origin.toUpperCase();
  const d = args.destination.toUpperCase();
  const ms = `${o}-${d}-${args.departureDate}_${d}-${o}-${args.returnDate}`;
  const q = new URLSearchParams({ m: "aereo", ms, ad: String(args.adults ?? 1) });
  if (args.picks?.some((p) => p.airline || p.time)) q.set("ps", encodePicks(args.picks));
  return `https://pedidos.viaair.tur.br/voar?${q.toString()}`;
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
  /** Multi-trecho: a volta veio de OUTRA pesquisa (somente ida). */
  inboundSearchKey?: string | null;
  isMultiLeg?: boolean;
  multiLegSavings?: number | null;
}) {
  const { route, out, inb, markups } = args;

  const passengers = out.price.passengerCount || 1;
  const total = (out.price.total ?? 0) + (inb?.price.total ?? 0);
  const fare = (out.price.price ?? 0) + (inb?.price.price ?? 0);
  const taxes = Math.max(0, total - fare);

  const air = airlineOf(out);
  const airIn = inb ? airlineOf(inb) : null;

  // Código metropolitano (SAO/RIO...) é cidade, não aeroporto: gravamos o
  // aeroporto realmente encontrado na pesquisa (CGH, GRU, SDU, GIG...).
  const segOut = out.journey?.segments ?? [];
  const partida = out.journey?.departure ?? segOut[0]?.departure;
  const chegada = out.journey?.destination ?? segOut[segOut.length - 1]?.destination;
  const originIata = isMetroCode(route.origin_iata)
    ? (partida?.iata?.toUpperCase() ?? route.origin_iata)
    : route.origin_iata;
  const destinationIata = isMetroCode(route.destination_iata)
    ? (chegada?.iata?.toUpperCase() ?? route.destination_iata)
    : route.destination_iata;
  const originCity = resolveCity(route.origin_iata, route.origin_city ?? partida?.city).name;
  const destinationCity = resolveCity(
    route.destination_iata,
    route.destination_city ?? chegada?.city,
  ).name;

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
      origin_iata: originIata,
      destination_iata: destinationIata,
      departure_date: args.departureDate,
      return_date: args.returnDate,
      airline_iata: air?.iata ?? null,
    }),
    scope: route.scope,
    origin_iata: originIata,
    origin_city: originCity,
    destination_iata: destinationIata,
    destination_city: destinationCity,
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
    // multi-trecho: ida e volta em companhias/pesquisas diferentes
    is_multi_leg: !!args.isMultiLeg,
    inbound_search_key: args.inboundSearchKey ?? null,
    inbound_airline_iata: airIn?.iata ?? null,
    inbound_airline_name: airIn?.name ?? null,
    inbound_airline_logo: airIn?.pathLogo ?? null,
    multi_leg_savings:
      args.isMultiLeg && args.multiLegSavings != null
        ? Number(args.multiLegSavings.toFixed(2))
        : null,
    multi_leg_url:
      args.isMultiLeg && args.returnDate
        ? multiLegSearchUrl({
            origin: originIata,
            destination: destinationIata,
            departureDate: args.departureDate,
            returnDate: args.returnDate,
            adults: passengers,
            picks: [horaPick(out, air?.iata ?? null), horaPick(inb, airIn?.iata ?? null)],
          })
        : null,

    fare_status: "valida" as const,
    quoted_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),

  };
  return row;
}

/** Timeout duro por chamada ao motor (nenhuma consulta prende a coleta). */
export const ENGINE_CALL_TIMEOUT_MS = 60_000;

/**
 * TIMEOUT ADAPTATIVO POR CANDIDATA.
 *
 * O valor fixo de 100s cortava consultas legítimas: o p95 do motor está
 * praticamente em 100s, ou seja, metade das rotas lentas virava "timeout"
 * mesmo estando prestes a responder. Agora o limite depende do TRABALHO real
 * da candidata (ida x ida-e-volta, nacional x internacional), da tentativa e
 * do desempenho observado do motor NA PRÓPRIA EXECUÇÃO.
 */
export const CANDIDATE_TIMEOUT_BASE = {
  nacional_ida: 110_000,
  nacional_ida_volta: 135_000,
  internacional_ida: 140_000,
  internacional_ida_volta: 165_000,
} as const;

/** Menor timeout possível — base do cálculo da janela mínima de claim. */
export const CANDIDATE_TIMEOUT_FLOOR_MS = CANDIDATE_TIMEOUT_BASE.nacional_ida;

/** Teto absoluto: consulta realmente travada não pode virar espera eterna. */
export const CANDIDATE_TIMEOUT_MAX_MS = 190_000;

/** Compatibilidade: valor de referência quando não há candidata no contexto. */
export const CANDIDATE_TIMEOUT_MS = CANDIDATE_TIMEOUT_BASE.nacional_ida_volta;

/** Acima desta fração do próprio timeout a consulta é "lenta, mas concluída". */
export const SLOW_RESPONSE_RATIO = 0.75;

export function candidateTimeoutMs(
  cand: { scope?: string | null; return_date?: string | null; attempts?: number | null },
  /** p95 observado (ms) das validações já concluídas nesta execução */
  observedP95?: number | null,
): number {
  const intl = (cand.scope ?? "nacional").toLowerCase() === "internacional";
  const idaVolta = !!cand.return_date;
  const base = intl
    ? idaVolta
      ? CANDIDATE_TIMEOUT_BASE.internacional_ida_volta
      : CANDIDATE_TIMEOUT_BASE.internacional_ida
    : idaVolta
      ? CANDIDATE_TIMEOUT_BASE.nacional_ida_volta
      : CANDIDATE_TIMEOUT_BASE.nacional_ida;

  // Adaptação ao motor: se o p95 real subiu, o limite acompanha (1,4x o p95).
  const adaptativo = observedP95 && observedP95 > 0 ? Math.ceil(observedP95 * 1.4) : 0;

  // Retentativa recebe folga extra: a rota já mostrou que é lenta.
  const tentativa = Math.max(0, Number(cand.attempts ?? 0));
  const fatorRetry = 1 + Math.min(tentativa, 2) * 0.15;

  const alvo = Math.max(base, adaptativo) * fatorRetry;
  return Math.round(Math.min(CANDIDATE_TIMEOUT_MAX_MS, Math.max(CANDIDATE_TIMEOUT_FLOOR_MS, alvo)));
}


export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let vivo = true;
    const t = setTimeout(() => {
      if (!vivo) return;
      vivo = false;
      reject(new Error(`timeout:${label}:${ms}ms`));
    }, ms);
    // CANCELAMENTO IMEDIATO: não esperamos a requisição pendente terminar —
    // soltamos o worker na hora (a promessa órfã é descartada).
    const onAbort = () => {
      if (!vivo) return;
      vivo = false;
      clearTimeout(t);
      reject(new Error(`cancelado:${label}`));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
    p.then(
      (v) => {
        signal?.removeEventListener("abort", onAbort);
        if (!vivo) return;
        vivo = false;
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        signal?.removeEventListener("abort", onAbort);
        if (!vivo) return;
        vivo = false;
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Pesquisa uma rota/data e devolve a melhor oportunidade (ou null). */
/** Telemetria de UMA chamada ao motor VIA AIR (diagnóstico de lentidão). */
export type EngineTiming = {
  step: "ida" | "volta" | "somente_ida" | "somente_volta";
  ms: number;
  ok: boolean;
};

export type EngineTimingSink = (t: EngineTiming) => void;

/** Mede cada requisição real ao motor, sem alterar o comportamento. */
async function medirMotor<T>(
  step: EngineTiming["step"],
  exec: () => Promise<T>,
  sink?: EngineTimingSink,
): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await exec();
    sink?.({ step, ms: Date.now() - t0, ok: true });
    return r;
  } catch (err) {
    sink?.({ step, ms: Date.now() - t0, ok: false });
    throw err;
  }
}

export async function quoteRoute(args: {
  route: PromoRoute;
  departureDate: string;
  returnDate: string | null;
  markups: MarkupTable;
  adults?: number;
  /**
   * Preço de referência (Radar/Melhores Destinos ou informado na busca manual).
   * Quando a tarifa encontrada difere mais de R$ 100 desse valor, o multi-trecho
   * é SEMPRE pesquisado — inclusive em rotas internacionais.
   */
  referencePrice?: number | null;
  /** Cancelamento cooperativo: aborta antes de disparar cada consulta ao motor. */
  signal?: AbortSignal;
  /** Diagnóstico: recebe o tempo de cada requisição feita ao motor VIA AIR. */
  onEngineTiming?: EngineTimingSink;
  /** Orçamento total desta candidata (ms) — define o prazo interno de combinações. */
  budgetMs?: number;


}) {
  const { route, departureDate, returnDate } = args;
  const abortou = () => {
    if (args.signal?.aborted) throw new Error("cancelado");
  };
  abortou();
  const base = {
    departureIata: route.origin_iata,
    arrivalIata: route.destination_iata,
    departureDate,
    adults: args.adults ?? 1,
    children: 0,
    infants: 0,
    pageSize: 20,
    // SAO/RIO... são cidades: o motor precisa varrer todos os aeroportos.
    departureIsCity: isMetroCode(route.origin_iata),
    arrivalIsCity: isMetroCode(route.destination_iata),
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

  const res = await medirMotor(
    "ida",
    () =>
      withTimeout(
        searchFlights({ ...base, returnDate } as never, "normal", args.signal),
        ENGINE_CALL_TIMEOUT_MS,
        "ida",
        args.signal,
      ),
    args.onEngineTiming,
  );
  const candidatas = [...(res.outbound?.flights ?? [])].sort(
    (a, b) => a.price.total - b.price.total,
  );
  let out = candidatas[0];
  if (!out) return null;

  let inb: OnerFlight | null = null;
  let multiLeg = false;
  let multiSavings: number | null = null;
  let inboundSearchKey: string | null = null;
  let outboundSearchKey: string | null = null;

  if (returnDate) {
    // IDA E VOLTA: o preço final é ida + volta. A ida mais barata muitas vezes
    // tem a volta mais cara — por isso testamos as primeiras candidatas e
    // ficamos com a MENOR SOMA.
    //
    // PRIORIDADE COMERCIAL: ida e volta na MESMA companhia. A combinação com
    // companhias diferentes só é usada quando economiza de verdade (regra do
    // multi-trecho, abaixo) — e apenas em voos NACIONAIS.
    const MAX_COMBINACOES = 5;
    const prazo = Date.now() + CANDIDATE_TIMEOUT_MS * 0.7;
    let melhorTotal = Number.POSITIVE_INFINITY;
    let melhorOut: OnerFlight | null = null;
    let melhorIn: OnerFlight | null = null;
    let mesmaTotal = Number.POSITIVE_INFINITY;
    let mesmaOut: OnerFlight | null = null;
    let mesmaIn: OnerFlight | null = null;

    for (const cand of candidatas.slice(0, MAX_COMBINACOES)) {
      // Já não há como uma combinação ficar melhor: a ida sozinha custa mais.
      if (melhorIn && cand.price.total >= melhorTotal) break;
      if (melhorIn && Date.now() > prazo) break;
      if (args.signal?.aborted) break;
      try {
        const back = await medirMotor(
          "volta",
          () =>
            withTimeout(
              searchInboundFlights(
                {
                  ...base,
                  returnDate,
                  searchKey: res.searchKey,
                  flightKey: cand.key,
                } as never,
                "normal",
                args.signal,
              ),
              ENGINE_CALL_TIMEOUT_MS,
              "volta",
              args.signal,
            ),
          args.onEngineTiming,
        );
        const voltas = [...(back.flights ?? [])].sort((a, b) => a.price.total - b.price.total);
        const melhor = voltas[0] ?? null;
        if (!melhor) continue;
        const soma = (cand.price.total ?? 0) + (melhor.price.total ?? 0);
        if (soma < melhorTotal) {
          melhorTotal = soma;
          melhorOut = cand;
          melhorIn = melhor;
        }
        // melhor combinação com a MESMA companhia na ida e na volta
        const ciaIda = airlineOf(cand)?.iata;
        const mesma = ciaIda ? voltas.find((v) => airlineOf(v)?.iata === ciaIda) : null;
        if (mesma) {
          const somaMesma = (cand.price.total ?? 0) + (mesma.price.total ?? 0);
          if (somaMesma < mesmaTotal) {
            mesmaTotal = somaMesma;
            mesmaOut = cand;
            mesmaIn = mesma;
          }
        }
      } catch {
        /* tenta a próxima candidata */
      }
    }

    if (!melhorOut || !melhorIn) return null;

    const nacional = route.scope === "nacional";
    const diferenca = mesmaOut && mesmaIn ? mesmaTotal - melhorTotal : 0;

    // A) MELHOR IDA+VOLTA CONVENCIONAL (com a preferência comercial de manter a
    //    mesma companhia quando a diferença é pequena).
    const usaMesma = !!(mesmaOut && mesmaIn && diferenca < MULTI_LEG_MIN_DIFF);
    const convOut = usaMesma ? mesmaOut! : melhorOut;
    const convIn = usaMesma ? mesmaIn! : melhorIn;
    const convTotal = usaMesma ? mesmaTotal : melhorTotal;

    out = convOut;
    inb = convIn;

    // GATILHO POR REFERÊNCIA: sempre que a tarifa encontrada difere mais de
    // R$ 100 do valor de referência (Radar/MD ou informado na busca manual),
    // o multi-trecho também é pesquisado — vale para nacional e internacional.
    const referencia = Number(args.referencePrice ?? 0);
    const difRef = referencia > 0 ? Math.abs(convTotal - referencia) : null;
    const gatilhoReferencia = difRef != null && difRef > MULTI_LEG_MIN_DIFF;

    if (!nacional && !gatilhoReferencia) {
      // Internacional sem gatilho: comportamento normal (melhor soma, carrinho único).
      out = melhorOut;
      inb = melhorIn;
    } else {
      // B) COMPOSIÇÃO INDEPENDENTE — SEMPRE pesquisada em voos nacionais e,
      //    agora, também quando o gatilho da referência dispara:
      //    MGF→BPS somente ida + BPS→MGF somente ida, qualquer companhia.
      if (!nacional) {
        // internacional: a base de comparação segue sendo a melhor soma
        out = melhorOut;
        inb = melhorIn;
      }
      const baseTotal = nacional ? convTotal : melhorTotal;
      const baseOut = nacional ? convOut : melhorOut;
      const perna = await quoteOneWayLegs({
        base,
        route,
        departureDate,
        returnDate,
        signal: args.signal,
        onEngineTiming: args.onEngineTiming,
      });
      const economia = perna ? Number((baseTotal - perna.total).toFixed(2)) : null;

      console.info(
        "[promo-multitrip]",
        JSON.stringify({
          route: `${route.origin_iata}-${route.destination_iata}`,
          departureDate,
          returnDate,
          scope: route.scope,
          reference_price: referencia > 0 ? referencia : null,
          reference_diff: difRef,
          triggered_by_reference: gatilhoReferencia,
          roundtrip_best_total: Number(melhorTotal.toFixed(2)),
          roundtrip_airline: airlineOf(melhorOut)?.iata ?? null,
          roundtrip_same_airline_total: Number.isFinite(mesmaTotal) ? Number(mesmaTotal.toFixed(2)) : null,
          conventional_total: Number(baseTotal.toFixed(2)),
          conventional_airline: airlineOf(baseOut)?.iata ?? null,
          outbound_best_total: perna ? Number((perna.out.price.total ?? 0).toFixed(2)) : null,
          outbound_airline: perna ? (airlineOf(perna.out)?.iata ?? null) : null,
          return_best_total: perna ? Number((perna.inb.price.total ?? 0).toFixed(2)) : null,
          return_airline: perna ? (airlineOf(perna.inb)?.iata ?? null) : null,
          mixed_total: perna ? Number(perna.total.toFixed(2)) : null,
          savings_vs_roundtrip: economia,
          threshold: MULTI_LEG_MIN_DIFF,
          outbound_search_status: perna ? "ok" : "sem_tarifa",
          return_search_status: perna ? "ok" : "sem_tarifa",
          reason_multitrip_not_available: perna
            ? economia != null && economia > MULTI_LEG_MIN_DIFF
              ? null
              : "economia_abaixo_do_limite"
            : "pesquisa_somente_ida_sem_resultado",
          selected_mode:
            perna && economia != null && economia > MULTI_LEG_MIN_DIFF ? "multitrip" : "roundtrip",
        }),
      );

      if (perna && economia != null && economia > MULTI_LEG_MIN_DIFF) {
        out = perna.out;
        inb = perna.inb;
        inboundSearchKey = perna.inboundSearchKey;
        outboundSearchKey = perna.outboundSearchKey;
        multiLeg = true;
        multiSavings = economia;
      }
    }


    if (!inb) return null;
  }



  return buildPromotionRow({
    route,
    searchKey: multiLeg ? (outboundSearchKey ?? res.searchKey) : res.searchKey,
    out,
    inb,
    departureDate,
    returnDate: inb ? returnDate : null,
    markups: args.markups,
    inboundSearchKey,
    isMultiLeg: multiLeg,
    multiLegSavings: multiSavings,
  });
}

/**
 * MULTI-TRECHO — pesquisa ida e volta como duas viagens de SOMENTE IDA.
 * Devolve as duas tarifas independentes (cada uma com a sua pesquisa),
 * exatamente como o cliente vai comprar no motor, trecho por trecho.
 */
async function quoteOneWayLegs(args: {
  base: Record<string, unknown>;
  route: PromoRoute;
  departureDate: string;
  returnDate: string;
  signal?: AbortSignal;
  onEngineTiming?: EngineTimingSink;
}): Promise<{
  out: OnerFlight;
  inb: OnerFlight;
  outboundSearchKey: string;
  inboundSearchKey: string;
  total: number;
} | null> {
  const { base, route, departureDate, returnDate } = args;
  try {
    // As duas pernas são independentes: pesquisar em paralelo corta pela metade
    // o tempo do multi-trecho. A concorrência global continua limitada pelo
    // pool do worker (AIRFARE_VALIDATION_CONCURRENCY).
    const [ida, volta] = await Promise.all([
      medirMotor(
        "somente_ida",
        () =>
          withTimeout(
            searchFlights({ ...base, departureDate, returnDate: null } as never, "normal", args.signal),
            ENGINE_CALL_TIMEOUT_MS,
            "multi:ida",
            args.signal,
          ),
        args.onEngineTiming,
      ),
      medirMotor(
        "somente_volta",
        () =>
          withTimeout(
            searchFlights(
              {
                ...base,
                departureIata: route.destination_iata,
                arrivalIata: route.origin_iata,
                departureIsCity: isMetroCode(route.destination_iata),
                arrivalIsCity: isMetroCode(route.origin_iata),
                departureDate: returnDate,
                returnDate: null,
              } as never,
              "normal",
              args.signal,
            ),
            ENGINE_CALL_TIMEOUT_MS,
            "multi:volta",
            args.signal,
          ),
        args.onEngineTiming,
      ),
    ]);

    const melhorIda = [...(ida.outbound?.flights ?? [])].sort(
      (a, b) => a.price.total - b.price.total,
    )[0];
    const melhorVolta = [...(volta.outbound?.flights ?? [])].sort(
      (a, b) => a.price.total - b.price.total,
    )[0];
    if (!melhorIda || !melhorVolta) return null;
    return {
      out: melhorIda,
      inb: melhorVolta,
      outboundSearchKey: ida.searchKey,
      inboundSearchKey: volta.searchKey,
      total: (melhorIda.price.total ?? 0) + (melhorVolta.price.total ?? 0),
    };
  } catch {
    return null;
  }
}


/** Considera travada/abandonada uma execução parada há mais de 45 minutos. */
const RUN_STALE_MS = 45 * 60 * 1000;

/** Status considerados "execução viva". */
export const ACTIVE_RUN_STATUSES = ["running", "cancel_requested"] as const;

/**
 * CANCELAMENTO COOPERATIVO — running → cancel_requested → cancelada.
 * Nada é apagado: o que já foi validado permanece na curadoria.
 */
export async function requestPromoRunCancel(runId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as AnyClient;
  const now = new Date().toISOString();

  let alvo = runId;
  if (!alvo) {
    const { data } = await db
      .from("airfare_promo_runs")
      .select("id")
      .in("status", ACTIVE_RUN_STATUSES as unknown as string[])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    alvo = (data as { id?: string } | null)?.id;
  }
  if (!alvo) return { cancelled: false as const, reason: "sem_coleta_ativa" };

  // 1) marca o pedido (os workers em voo leem este status ~1x/s e abortam)
  await db
    .from("airfare_promo_runs")
    .update({ status: "cancel_requested", cancel_requested_at: now, updated_at: now })
    .eq("id", alvo)
    .in("status", ACTIVE_RUN_STATUSES as unknown as string[]);

  // 2) esvazia a fila NA HORA: nada mais entra em validação. Inclui as
  //    candidatas já em `processing` — o worker que as segurava aborta a
  //    requisição em curso e não grava mais nada nesta execução.
  await db
    .from("airfare_promo_candidates")
    .update({ status: "cancelled", processed_at: now })
    .eq("run_id", alvo)
    .in("status", ["pending", "processing"]);

  // 3) encerra a execução IMEDIATAMENTE — não esperamos a fila atual drenar.
  //    A UI já mostra "Atualização cancelada" no próximo refresh (~1s).
  const { finalizeCancelledRun } = await import("@/lib/airfare-promos.worker.server");
  await finalizeCancelledRun(alvo);

  return { cancelled: true as const, runId: alvo };
}

/**
 * Cria a execução (trava global). Devolve null se já existe uma ativa.
 * `force` (botão "Atualizar agora") encerra corretamente a run anterior
 * antes de começar uma rodada COMPLETA e nova.
 */
export async function startPromoRun(
  trigger: "manual" | "cron",
  opts?: { force?: boolean },
): Promise<{ id: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as AnyClient;

  const { data: ativas } = await db
    .from("airfare_promo_runs")
    .select("id,updated_at,status")
    .in("status", ACTIVE_RUN_STATUSES as unknown as string[])
    .order("started_at", { ascending: false });

  for (const active of (ativas ?? []) as Array<{ id: string; updated_at: string }>) {
    const idle = Date.now() - new Date(active.updated_at).getTime();
    if (!opts?.force && idle < RUN_STALE_MS) return null;
    const now = new Date().toISOString();
    await db
      .from("airfare_promo_runs")
      .update({
        status: "cancelada",
        phase: "cancelada",
        cancelled_at: now,
        error_message: opts?.force
          ? "Encerrada por nova atualização manual"
          : "Execução interrompida (sem atualização)",
        finished_at: now,
        updated_at: now,
      })
      .eq("id", active.id);
    await db
      .from("airfare_promo_candidates")
      .update({ status: "cancelled", processed_at: now })
      .eq("run_id", active.id)
      .in("status", ["pending", "processing"]);
  }

  const { data, error } = await db
    .from("airfare_promo_runs")
    .insert({ status: "running", trigger, phase: "descobrindo" })
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
  /** orçamento de tempo por invocação (retomável) */
  budgetMs?: number;
  /** origem do disparo (diagnóstico) */
  trigger?: "manual" | "cron" | "resume";
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { discoverCandidates, candidateSignature } = await import(
    "@/lib/airfare-promos.discovery.server"
  );
  const { PROMO_VALIDATION_CONCURRENCY, maxOpportunitiesForOrigin } = await import(
    "@/lib/airfare-promos.config"
  );
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

  await touch({ phase: "descobrindo", total: 0, processed: 0, saved: 0, radar_note: "Consultando radar de oportunidades..." });
  console.info(
    "[airfare-radar]",
    JSON.stringify({ trigger: opts?.trigger ?? "desconhecido", run_id: runId ?? null, radar_adapter: "melhores-destinos.radar-api.server", lock_status: runId ? "adquirido" : "sem_run", queue_status: "aguardando_descoberta", api_started: true }),
  );

  // cancelamento cooperativo: checado inclusive durante espera/backoff do radar
  let ultimaChecagem = 0;
  let cancelPedido = false;
  const pediuCancelamento = async () => {
    if (!runId || cancelPedido) return cancelPedido;
    if (Date.now() - ultimaChecagem < 1000) return cancelPedido;
    ultimaChecagem = Date.now();
    try {
      const { data } = await db
        .from("airfare_promo_runs")
        .select("status")
        .eq("id", runId)
        .maybeSingle();
      const st = (data as { status?: string } | null)?.status;
      // qualquer status diferente de "running" encerra a descoberta na hora
      // (o cancelamento marca a execução como "cancelada" imediatamente)
      cancelPedido = !!st && st !== "running";
    } catch {
      /* checagem best-effort */
    }
    return cancelPedido;
  };

  let notaRadar = "Consultando radar de oportunidades...";

  // heartbeat: enquanto o radar roda, a execução continua "viva" para o worker
  const batimento = setInterval(() => {
    void touch({ phase: "descobrindo", radar_note: notaRadar });
  }, 20_000);

  // 1) RADAR: oportunidades do Melhores Destinos (descoberta ilimitada,
  //    seleção de até N por origem — ver airfare-promos.config.ts)
  let descoberta: Awaited<ReturnType<typeof discoverCandidates>>;
  // A etapa de radar NUNCA pode passar do orçamento da invocação: se passar,
  // a invocação morre no meio da descoberta, nada é gravado e o cron reinicia
  // a descoberta do zero para sempre (execução travada em "descobrindo").
  // Com o teto abaixo a descoberta sempre termina, grava o que achou e a fila
  // segue para validação — o cache do radar faz a próxima passada ir além.
  const orcamentoInvocacao = opts?.budgetMs ?? 240_000;
  const orcamentoRadar = Math.max(60_000, Math.floor(orcamentoInvocacao * 0.6));
  try {
    descoberta = await discoverCandidates({
      maxCandidates: opts?.maxCandidates ?? 600,
      radarBudgetMs: orcamentoRadar,
      cancel: pediuCancelamento,
      onProgress: (msg) => {
        notaRadar = msg;
      },
    });
  } finally {
    clearInterval(batimento);
  }


  if (descoberta.cancelled || (await pediuCancelamento())) {
    const agora = new Date().toISOString();
    await touch({
      status: "cancelada",
      phase: "cancelada",
      cancelled_at: agora,
      finished_at: agora,
      radar_note: "Cancelada durante a consulta ao radar.",
      radar_available: descoberta.radarAvailable,
      radar_errors: descoberta.radarErrors,
    });
    return {
      startedAt,
      ...counters,
      total: 0,
      processed: 0,
      remaining: 0,
      finished: true,
      cancelled: true,
      origin_metrics: [] as OriginMetrics[],
    };
  }
  await touch({
    phase: "curadoria",
    discovered_raw: descoberta.discoveredTotal,
    deduped: descoberta.dedupedTotal,
    radar_available: descoberta.radarAvailable,
    radar_errors: descoberta.radarErrors,
    source_metrics: descoberta.sourceMetrics ?? {},
    radar_note: descoberta.radarAvailable
      ? `Curadoria concluída — ${descoberta.radarLeads} oportunidades descobertas`
      : "Sem novas oportunidades no Passagens Baratas — promoções anteriores preservadas",
  });
  console.info(
    "[airfare-radar] resultado",
    JSON.stringify({
      trigger: opts?.trigger ?? "desconhecido",
      run_id: runId ?? null,
      radar_adapter: "melhores-destinos.radar-api.server",
      api_started: true,
      categories_received: (descoberta.sourceMetrics as Record<string, unknown> | undefined)?.["md_categories_received"] ?? 0,
      routes_found: (descoberta.sourceMetrics as Record<string, unknown> | undefined)?.["md_routes_received"] ?? 0,
      candidates_after_dedupe: descoberta.dedupedTotal,
      candidates_selected: descoberta.candidates.length,
      radar_errors: descoberta.radarErrors,
      error_code: descoberta.radarError ?? null,
      error_stage: descoberta.radarErrorStage ?? null,
    }),
  );
  const candidatas = descoberta.candidates;
  const metricasPorOrigem = new Map<string, Metrics>(
    descoberta.metrics.map((m) => [m.origin, { ...m }]),
  );
  const temposPorOrigem = new Map<string, number[]>();
  const porAssinatura = new Map(candidatas.map((c) => [c.signature, c]));

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



  // 2) SEM FALLBACK ARTIFICIAL.
  //    A única fonte de oportunidades do automático é a camada interna do
  //    Passagens Baratas. Sem oportunidades recentes armazenadas, a coleta
  //    apenas informa que não há novidades e preserva as promoções anteriores.
  const semOportunidades = !descoberta.radarAvailable;
  const fallbackAdicionadas = 0;

  await touch({
    radar_available: descoberta.radarAvailable,
    radar_errors: descoberta.radarErrors,
    fallback_count: 0,
    radar_note: semOportunidades
      ? descoberta.radarError
        ? `Radar do Melhores Destinos falhou nesta execução (${descoberta.radarErrorStage ?? "radar"}): ${descoberta.radarError}. As promoções válidas da coleta anterior foram preservadas.`
        : "O radar respondeu, mas não trouxe oportunidades novas nesta execução. As promoções válidas da coleta anterior foram preservadas."
      : null,
  });

  /**
   * ORDEM DA FILA — MAIOR POTENCIAL DE ECONOMIA PRIMEIRO.
   *
   * Não muda coleta, elegibilidade nem quantidade: só decide quem o motor
   * valida antes. A economia estimada é a distância entre o preço de
   * referência do radar e a mediana do mesmo escopo — quanto mais abaixo da
   * mediana, mais cedo a oportunidade entra no motor e aparece na curadoria.
   */
  const medianaDoEscopo = (escopo: string): number => {
    const precos = [...porAssinatura.values()]
      .filter((c) => c.scope === escopo && Number(c.reference_price) > 0)
      .map((c) => Number(c.reference_price))
      .sort((a, b) => a - b);
    if (!precos.length) return 0;
    return precos[Math.floor(precos.length / 2)]!;
  };
  const medianas = new Map<string, number>([
    ["nacional", medianaDoEscopo("nacional")],
    ["internacional", medianaDoEscopo("internacional")],
  ]);
  const economiaEstimada = (c: { scope: string; reference_price?: number | null }): number => {
    const ref = Number(c.reference_price ?? 0);
    const med = medianas.get(c.scope) ?? 0;
    if (!ref || !med) return 0;
    return Math.max(0, med - ref);
  };

  const fila = [...porAssinatura.values()]
    .sort((a, b) => a.priority - b.priority || economiaEstimada(b) - economiaEstimada(a))
    .map((c, i) => ({ ...c, priority: c.priority * 1000 + i }));
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
    discovered_raw: descoberta.discoveredTotal,
    deduped: descoberta.dedupedTotal,
    origin_metrics: metricasSnapshot(),
    processed: 0,
    saved: 0,
  });

  // 4) PROCESSAMENTO RETOMÁVEL: o worker consome a fila em lotes com orçamento
  //    de tempo. O que sobrar continua `pending` no banco e é retomado pelo
  //    cron — nada depende de sessão, aba aberta ou Command Center.
  const { processPendingCandidates } = await import("@/lib/airfare-promos.worker.server");
  const res = runId
    ? await processPendingCandidates({ runId, budgetMs: opts?.budgetMs, concurrency })
    : { processed: 0, remaining: queued.length, finished: false };

  return {
    startedAt,
    ...counters,
    total: queued.length,
    processed: res.processed,
    remaining: res.remaining,
    finished: res.finished,
    origin_metrics: metricasSnapshot(),
  };
}



