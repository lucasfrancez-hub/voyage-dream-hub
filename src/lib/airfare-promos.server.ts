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
    airline_rule: cond.airlineRule as unknown as Record<string, unknown>,
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
      inb = [...(back.inbound?.flights ?? back.outbound?.flights ?? [])].sort(
        (a, b) => a.price.total - b.price.total,
      )[0] ?? null;
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
    markups,
  });
}

/**
 * Roda a coleta: percorre as rotas ativas (por prioridade) e faz upsert das
 * promoções encontradas. Usado pelo cron das 09:00 e 15:00 (BRT) e pelo
 * botão "Atualizar agora" do Command Center.
 */
export async function collectAirfarePromotions(opts?: {
  routeIds?: string[];
  maxRoutes?: number;
  offsets?: number[];
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const markups = await loadMarkups(supabaseAdmin as unknown as AnyClient);

  let q = (supabaseAdmin as unknown as AnyClient)
    .from("airfare_promo_routes")
    .select("id,origin_iata,origin_city,destination_iata,destination_city,scope,priority")
    .eq("active", true)
    .order("priority", { ascending: true });
  if (opts?.routeIds?.length) q = q.in("id", opts.routeIds);

  const { data: routes, error } = await q;
  if (error) throw new Error(error.message);

  const list = (routes ?? []).slice(0, opts?.maxRoutes ?? 12) as PromoRoute[];
  const pairs = defaultDatePairs(opts?.offsets);

  let saved = 0;
  const errors: string[] = [];

  for (const route of list) {
    for (const pair of pairs) {
      try {
        const row = await quoteRoute({
          route,
          departureDate: pair.departureDate,
          returnDate: pair.returnDate,
          markups,
        });
        if (!row) continue;
        const { error: upErr } = await (supabaseAdmin as unknown as AnyClient)
          .from("airfare_promotions")
          .upsert(row, { onConflict: "signature" });
        if (upErr) errors.push(`${route.origin_iata}-${route.destination_iata}: ${upErr.message}`);
        else saved++;
      } catch (err) {
        errors.push(
          `${route.origin_iata}-${route.destination_iata}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { routes: list.length, saved, errors };
}
