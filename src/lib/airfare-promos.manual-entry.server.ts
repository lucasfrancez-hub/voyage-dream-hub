/**
 * PROMOÇÃO AÉREA 100% MANUAL.
 *
 * O administrador digita os voos e os valores (igual ao cadastro de um aéreo
 * dentro do pedido). Nada é cotado no motor VIA AIR: o preço informado é o
 * preço comercial. O parcelamento sai da regra da companhia aérea + tabela de
 * markup do financeiro, e o link gerado é o NOSSO checkout (orçamento público
 * AIR_ONLY), não o carrinho da operadora.
 *
 * SERVER-ONLY.
 */
import { findAirline } from "@/lib/airlines";
import { resolveCity } from "@/lib/iata-lookup";
import { scopeOfRoute } from "@/lib/br-airports";
import {
  buildExtendedQuotes,
  getAirfarePaymentConditions,
  quotesToExtendedOptions,
} from "@/lib/airfare-conditions";
import { promoSignature } from "@/lib/airfare-promos.server";
import { curationDayBRT } from "@/lib/airfare-promos.worker.server";

/** Marcador em `reference_source` das promoções digitadas à mão. */
export const MANUAL_SOURCE = "manual";

export type ManualLegInput = {
  direction: "OUTBOUND" | "INBOUND";
  date: string; // YYYY-MM-DD
  fromIata: string;
  toIata: string;
  airlineIata: string;
  flightNumber?: string | null;
  departureTime?: string | null; // HH:MM
  arrivalTime?: string | null; // HH:MM
  duration?: string | null;
  stops?: number | null;
  checkedBaggage?: boolean;
};

export type ManualPromotionInput = {
  id?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  cabinClass?: string | null;
  adults: number;
  /** tarifa total (todos os passageiros), sem taxas */
  farePrice: number;
  /** taxas totais (todos os passageiros) */
  taxes: number;
  legs: ManualLegInput[];
  notes?: string | null;
};

function n2(v: number): number {
  return Number((Number(v) || 0).toFixed(2));
}

export function buildManualPromotionRow(input: ManualPromotionInput, markups: Record<number, number>) {
  const out = input.legs.find((l) => l.direction === "OUTBOUND");
  if (!out) throw new Error("Informe pelo menos o voo de ida.");
  const inb = input.legs.find((l) => l.direction === "INBOUND") ?? null;

  const origin = out.fromIata.trim().toUpperCase();
  const destination = out.toIata.trim().toUpperCase();
  const passengers = Math.max(1, Math.trunc(input.adults || 1));
  const fare = Math.max(0, Number(input.farePrice) || 0);
  const taxes = Math.max(0, Number(input.taxes) || 0);
  const total = n2(fare + taxes);
  if (total <= 0) throw new Error("Informe o valor da tarifa.");

  const orig = resolveCity(origin, input.originCity);
  const dest = resolveCity(destination, input.destinationCity);

  const air = findAirline(out.airlineIata) ?? null;
  const airIn = inb ? (findAirline(inb.airlineIata) ?? null) : null;

  const quotes = buildExtendedQuotes(total, markups);
  const extendedOptions = quotesToExtendedOptions(quotes);
  const condOut = getAirfarePaymentConditions({
    total,
    passengers,
    airline: { iata: air?.iata ?? out.airlineIata, name: air?.name ?? null },
    extendedOptions,
  });
  const condIn = airIn
    ? getAirfarePaymentConditions({
        total,
        passengers,
        airline: { iata: airIn.iata, name: airIn.name },
        extendedOptions,
      })
    : null;
  const cond =
    condIn && condIn.interestFree.installments < condOut.interestFree.installments ? condIn : condOut;
  const q12 = quotes.find((q) => q.installments === 12) ?? quotes[quotes.length - 1] ?? null;

  const departureDate = out.date;
  const returnDate = inb?.date ?? null;

  return {
    signature: promoSignature({
      origin_iata: origin,
      destination_iata: destination,
      departure_date: departureDate,
      return_date: returnDate,
      airline_iata: air?.iata ?? out.airlineIata.toUpperCase(),
    }),
    scope: scopeOfRoute(origin, destination),
    origin_iata: origin,
    origin_city: orig.name,
    destination_iata: destination,
    destination_city: dest.name,
    airline_iata: air?.iata ?? out.airlineIata.toUpperCase(),
    airline_name: air?.name ?? out.airlineIata.toUpperCase(),
    airline_logo: air?.logo ?? null,
    departure_date: departureDate,
    return_date: returnDate,
    is_round_trip: !!inb,
    stops: Math.max(0, Number(out.stops) || 0),
    has_checked_baggage: !!out.checkedBaggage && (!inb || !!inb.checkedBaggage),
    cabin_class: input.cabinClass ?? null,
    passengers,
    fare_price: n2(fare),
    taxes: n2(taxes),
    total_price: total,
    price_per_passenger: n2(total / passengers),
    interest_free_installments: cond.interestFree.installments,
    interest_free_installment_value: n2(cond.interestFree.installmentValue),
    airline_rule: JSON.parse(JSON.stringify(cond.airlineRule)) as unknown,
    extended_max_installments: q12?.installments ?? null,
    extended_installment_value_12x: q12 ? n2(q12.installmentValue) : null,
    extended_markup_12x: q12 ? Number(q12.markupPercent.toFixed(4)) : null,
    extended_total_12x: q12 ? n2(q12.total) : null,
    extended_options: quotes.map((q) => ({
      installments: q.installments,
      markup_percent: Number(q.markupPercent.toFixed(4)),
      total: n2(q.total),
      installment_value: n2(q.installmentValue),
    })),
    // manual: não existe tarifa no motor — sem chaves de carrinho da operadora
    search_key: null,
    outbound_fare_id: null,
    outbound_itinerary_id: null,
    inbound_fare_id: null,
    inbound_itinerary_id: null,
    is_multi_leg: false,
    inbound_search_key: null,
    inbound_airline_iata: airIn?.iata ?? inb?.airlineIata?.toUpperCase() ?? null,
    inbound_airline_name: airIn?.name ?? null,
    inbound_airline_logo: airIn?.logo ?? null,
    multi_leg_savings: null,
    multi_leg_url: null,
    reference_source: MANUAL_SOURCE,
    fare_status: "valida" as const,
    unavailable_at: null,
    quoted_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    raw: {
      manual: {
        legs: input.legs.map((l) => ({
          ...l,
          fromIata: l.fromIata.trim().toUpperCase(),
          toIata: l.toIata.trim().toUpperCase(),
          airlineIata: l.airlineIata.trim().toUpperCase(),
          stops: Math.max(0, Number(l.stops) || 0),
          checkedBaggage: !!l.checkedBaggage,
        })),
        notes: input.notes ?? null,
        cabinClass: input.cabinClass ?? null,
      },
    } as unknown,
  };
}

/** Cria/atualiza a promoção manual e devolve o id. */
export async function saveManualPromotion(input: ManualPromotionInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadMarkups } = await import("@/lib/airfare-promos.server");
  const markups = await loadMarkups(supabaseAdmin as never);
  const row = buildManualPromotionRow(input, markups as never);

  const client = supabaseAdmin as never as { from: (t: string) => any };
  const payload: Record<string, unknown> = {
    ...row,
    cycle_day: curationDayBRT(),
    cycle_state: "new",
    cycle_changed_fields: [],
    cycle_state_at: new Date().toISOString(),
    archived_at: null,
    archived_reason: null,
    archived_cycle_day: null,
    // valores mudaram → o link precisa ser regerado
    cart_url: null,
    short_url: null,
  };

  if (input.id) {
    const { data, error } = await client
      .from("airfare_promotions")
      .update(payload)
      .eq("id", input.id)
      .select("id,total_price")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (data as { id: string })?.id ?? input.id, totalPrice: row.total_price, created: false };
  }

  payload.status = "novo";
  const { data, error } = await client
    .from("airfare_promotions")
    .upsert(payload, { onConflict: "signature" })
    .select("id,total_price")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string })?.id ?? "", totalPrice: row.total_price, created: true };
}

/* ------------------------------------------------------------------ */
/* Link de checkout próprio (orçamento público AIR_ONLY)               */
/* ------------------------------------------------------------------ */

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dataExtenso(iso: string): string {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

function brl(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Gera (ou regrava) o orçamento público da promoção manual e devolve o link
 * do nosso checkout + link curto Via Air.
 */
export async function buildManualCheckoutLink(promo: {
  id: string;
  origin_iata: string;
  origin_city: string | null;
  destination_iata: string;
  destination_city: string | null;
  departure_date: string;
  return_date: string | null;
  passengers: number | null;
  total_price: number;
  airline_iata: string | null;
  airline_name: string | null;
  inbound_airline_iata?: string | null;
  stops?: number | null;
  cabin_class: string | null;
  has_checked_baggage: boolean | null;
  raw: unknown;
}): Promise<{ url: string; shortUrl: string | null }> {
  const { buildPayment } = await import("@/lib/public-quote/payments");
  const { savePublicQuote } = await import("@/lib/public-quote/store.server");
  const { cityLabel } = await import("@/lib/iata-lookup");
  const { rotatingAgent } = await import("@/lib/public-quote/agents");

  const rawObj = (promo.raw && typeof promo.raw === "object" ? (promo.raw as Record<string, unknown>) : {}) as {
    manual?: { legs?: ManualLegInput[] };
    flights?: ManualLegInput[];
  };
  const manual = rawObj.manual ?? {};
  // Promoção vinda do motor (preço ajustado à mão): monta ida (e volta) com o
  // que já está salvo na promoção.
  const paradas = Math.max(0, Number(promo.stops) || 0);

  // 1) trechos digitados à mão  2) detalhes gravados na coleta
  // 3) busca ao vivo no motor (promoções antigas, sem detalhe salvo)
  let detalhes: ManualLegInput[] | null = manual.legs?.length
    ? manual.legs
    : rawObj.flights?.length
      ? rawObj.flights
      : null;

  if (!detalhes) {
    const { fetchPromoFlightDetails } = await import("@/lib/airfare-promos.flight-details.server");
    const vivos = (await fetchPromoFlightDetails(promo as never)) as ManualLegInput[] | null;
    if (vivos?.length) {
      detalhes = vivos;
      const completo = promo.return_date
        ? vivos.some((l) => l.direction === "INBOUND")
        : true;
      // guarda para os próximos links (sem apagar nada do raw existente)
      if (completo) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("airfare_promotions")
            .update({ raw: { ...rawObj, flights: vivos } as never })
            .eq("id", promo.id);
        } catch {
          /* detalhe é opcional: segue com o link mesmo sem gravar */
        }
      }
    }
  }


  const resumoIda: ManualLegInput = {
    direction: "OUTBOUND",
    date: promo.departure_date,
    fromIata: promo.origin_iata,
    toIata: promo.destination_iata,
    airlineIata: promo.airline_iata ?? "",
    stops: paradas,
    checkedBaggage: !!promo.has_checked_baggage,
  };
  const resumoVolta: ManualLegInput = {
    direction: "INBOUND",
    date: promo.return_date ?? "",
    fromIata: promo.destination_iata,
    toIata: promo.origin_iata,
    airlineIata: promo.inbound_airline_iata ?? promo.airline_iata ?? "",
    stops: paradas,
    checkedBaggage: !!promo.has_checked_baggage,
  };

  // A volta NUNCA pode sumir do orçamento: se o detalhe veio só da ida,
  // completamos com o resumo salvo na promoção.
  const encontrados = detalhes ?? [];
  const legsInput: ManualLegInput[] = [
    encontrados.find((l) => l.direction === "OUTBOUND") ?? resumoIda,
    ...(promo.return_date
      ? [encontrados.find((l) => l.direction === "INBOUND") ?? resumoVolta]
      : []),
  ];




  const legs = legsInput.map((l) => {
    const air = findAirline(l.airlineIata);
    const stops = Math.max(0, Number(l.stops) || 0);
    return {
      direction: l.direction,
      label: l.direction === "OUTBOUND" ? "Voo de ida" : "Voo de volta",
      airline: air?.name ?? l.airlineIata,
      airlineIata: air?.iata ?? l.airlineIata,
      dateLabel: dataExtenso(l.date),
      departureTime: l.departureTime || "—",
      arrivalTime: l.arrivalTime || "—",
      fromIata: l.fromIata,
      fromCity: cityLabel(l.fromIata) || null,
      toIata: l.toIata,
      toCity: cityLabel(l.toIata) || null,
      duration: l.duration || null,
      stops,
      stopsLabel: stops === 0 ? "Direto" : stops === 1 ? "1 conexão" : `${stops} conexões`,
      cabin: promo.cabin_class,
      carryOn: true,
      personalItem: true,
      checkedBaggage: !!l.checkedBaggage,
      segments: [
        {
          airline: air?.name ?? l.airlineIata,
          airlineIata: air?.iata ?? l.airlineIata,
          flightNumber: l.flightNumber || null,
          fromIata: l.fromIata,
          fromName: cityLabel(l.fromIata) || null,
          toIata: l.toIata,
          toName: cityLabel(l.toIata) || null,
          departure: `${l.date} ${l.departureTime || "00:00"}`,
          arrival: `${l.date} ${l.arrivalTime || "00:00"}`,
          duration: l.duration || null,
        },
      ],
    };
  });

  const total = Number(promo.total_price) || 0;
  const adults = Math.max(1, Number(promo.passengers) || 1);
  // Promoção aérea: só Pix e cartão (X sem juros da companhia + demais com
  // juros de mercado). Boleto não vale para tarifa promocional.
  const base = buildPayment({
    type: "AIR_ONLY",
    total,
    airline: promo.airline_iata,
    startDate: promo.departure_date,
  });
  const payment = {
    ...base,
    methods: ["CARD", "PIX"] as typeof base.methods,
    boleto: { enabled: false, installments: [], note: null, untilTravel: null },
  };


  const origem = promo.origin_city || cityLabel(promo.origin_iata) || promo.origin_iata;
  const destino = promo.destination_city || cityLabel(promo.destination_iata) || promo.destination_iata;

  const { url, shortUrl } = await savePublicQuote({
    type: "AIR_ONLY",
    title: `${origem} → ${destino}`,
    subtitle: promo.airline_name ?? null,
    origin: origem,
    destination: destino,
    startDate: promo.departure_date,
    endDate: promo.return_date,
    tripKind: promo.return_date ? "Ida e volta" : "Somente ida",
    passengers: {
      adults,
      children: 0,
      infants: 0,
      label: `${adults} ${adults === 1 ? "adulto" : "adultos"}`,
    },
    products: { flights: [{ id: promo.id, optionId: "1", legs: legs as never }] },
    payment,
    totals: { products: total, taxes: 0, total, pixTotal: payment.pix.total },
    summary: [
      {
        icon: "flight",
        label: promo.return_date ? "Passagens aéreas (ida e volta)" : "Passagens aéreas (somente ida)",
        value: brl(total),
      },
    ],
    agent: rotatingAgent(promo.id),
    source: { type: "SYSTEM" },
    validUntil: null,
    publicNotes: null,
    // reaproveita o mesmo orçamento público (mesmo link) a cada regeração
    flightQuoteId: promo.id,
    optionIndex: 1,
  } as never);

  return { url, shortUrl };
}

/* ------------------------------------------------------------------ */
/* Edição dos trechos de uma promoção já salva                         */
/* ------------------------------------------------------------------ */

/**
 * Regrava apenas os VOOS (trechos) da promoção — o preço não muda.
 * Serve para completar horários/nº de voo das promoções vindas do motor,
 * que chegam sem esses dados e apareciam zeradas no orçamento público.
 * Zera o link para que seja regerado com os trechos corrigidos.
 */
export async function updatePromotionLegs(id: string, legs: ManualLegInput[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as never as { from: (t: string) => any };

  const { data: row, error } = await client
    .from("airfare_promotions")
    .select("id,raw")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Promoção não encontrada");

  const out = legs.find((l) => l.direction === "OUTBOUND");
  if (!out) throw new Error("Informe pelo menos o voo de ida.");
  const inb = legs.find((l) => l.direction === "INBOUND") ?? null;

  const norm = legs.map((l) => ({
    ...l,
    fromIata: l.fromIata.trim().toUpperCase(),
    toIata: l.toIata.trim().toUpperCase(),
    airlineIata: l.airlineIata.trim().toUpperCase(),
    stops: Math.max(0, Number(l.stops) || 0),
    checkedBaggage: !!l.checkedBaggage,
  }));

  const raw = ((row as { raw?: Record<string, unknown> | null }).raw ?? {}) as Record<string, unknown>;
  const manualPrev = (raw.manual ?? {}) as Record<string, unknown>;
  const air = findAirline(out.airlineIata) ?? null;
  const airIn = inb ? (findAirline(inb.airlineIata) ?? null) : null;

  const { error: uErr } = await client
    .from("airfare_promotions")
    .update({
      raw: { ...raw, manual: { ...manualPrev, legs: norm } },
      origin_iata: norm[0]!.fromIata,
      destination_iata: norm[0]!.toIata,
      departure_date: out.date,
      return_date: inb?.date ?? null,
      is_round_trip: !!inb,
      stops: Math.max(0, Number(out.stops) || 0),
      has_checked_baggage: !!out.checkedBaggage && (!inb || !!inb.checkedBaggage),
      airline_iata: air?.iata ?? out.airlineIata.toUpperCase(),
      airline_name: air?.name ?? out.airlineIata.toUpperCase(),
      airline_logo: air?.logo ?? null,
      inbound_airline_iata: airIn?.iata ?? inb?.airlineIata?.toUpperCase() ?? null,
      inbound_airline_name: airIn?.name ?? null,
      inbound_airline_logo: airIn?.logo ?? null,
      cart_url: null,
      short_url: null,
    })
    .eq("id", id);
  if (uErr) throw new Error(uErr.message);
  return { ok: true };
}
