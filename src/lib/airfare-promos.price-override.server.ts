/**
 * AJUSTE MANUAL DE PREÇO DE UMA PROMOÇÃO AÉREA.
 *
 * Às vezes o motor devolve um preço mais caro do que o que temos no sistema
 * interno (consolidadora, tarifa negociada, etc.). Aqui o administrador digita
 * o preço comercial e o sistema recalcula tudo: total, por passageiro,
 * parcelamento sem juros da companhia e as parcelas estendidas com markup.
 *
 * O link de venda é zerado para ser regerado com o novo valor, e a arte /
 * card social passa a usar o valor ajustado automaticamente (todos leem as
 * mesmas colunas da promoção).
 *
 * SERVER-ONLY.
 */
import {
  buildExtendedQuotes,
  getAirfarePaymentConditions,
  quotesToExtendedOptions,
} from "@/lib/airfare-conditions";

function n2(v: number): number {
  return Number((Number(v) || 0).toFixed(2));
}

export type PriceOverrideInput = {
  id: string;
  /** preço comercial POR PASSAGEIRO (já com taxas) */
  pricePerPassenger: number;
  /** taxas por passageiro (opcional — mantém as atuais quando ausente) */
  taxesPerPassenger?: number | null;
  /** companhia aérea (IATA) — quando informada, troca a cia e o parcelamento */
  airlineIata?: string | null;
};


export async function applyPromotionPriceOverride(input: PriceOverrideInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadMarkups } = await import("@/lib/airfare-promos.server");
  const client = supabaseAdmin as never as { from: (t: string) => any };

  const { data: promo, error } = await client
    .from("airfare_promotions")
    .select(
      "id,passengers,taxes,total_price,price_per_passenger,airline_iata,airline_name,inbound_airline_iata,inbound_airline_name,raw",
    )
    .eq("id", input.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!promo) throw new Error("Promoção não encontrada");

  const passengers = Math.max(1, Math.trunc(Number(promo.passengers) || 1));
  const perPax = Math.max(0, Number(input.pricePerPassenger) || 0);
  if (perPax <= 0) throw new Error("Informe um preço maior que zero.");

  const total = n2(perPax * passengers);
  const taxes =
    input.taxesPerPassenger === null || input.taxesPerPassenger === undefined
      ? Math.min(n2(Number(promo.taxes) || 0), total)
      : n2(Math.max(0, Number(input.taxesPerPassenger) || 0) * passengers);
  const fare = n2(Math.max(0, total - taxes));

  // troca opcional da companhia aérea (aplica na ida e na volta)
  const { findAirline } = await import("@/lib/airlines");
  const novaCia = input.airlineIata?.trim() ? findAirline(input.airlineIata) : undefined;
  const airlineIata = novaCia?.iata ?? promo.airline_iata ?? null;
  const airlineName = novaCia?.name ?? promo.airline_name ?? null;
  const inboundIata = novaCia ? novaCia.iata : (promo.inbound_airline_iata ?? null);
  const inboundName = novaCia ? novaCia.name : (promo.inbound_airline_name ?? null);

  const markups = await loadMarkups(supabaseAdmin as never);
  const quotes = buildExtendedQuotes(total, markups as never);
  const extendedOptions = quotesToExtendedOptions(quotes);

  const condOut = getAirfarePaymentConditions({
    total,
    passengers,
    airline: { iata: airlineIata, name: airlineName },
    extendedOptions,
  });
  const condIn = inboundIata
    ? getAirfarePaymentConditions({
        total,
        passengers,
        airline: { iata: inboundIata, name: inboundName },
        extendedOptions,
      })
    : null;
  const cond =
    condIn && condIn.interestFree.installments < condOut.interestFree.installments ? condIn : condOut;

  const q12 = quotes.find((q) => q.installments === 12) ?? quotes[quotes.length - 1] ?? null;

  const raw = (promo.raw && typeof promo.raw === "object" ? { ...(promo.raw as object) } : {}) as Record<
    string,
    unknown
  >;
  raw.price_override = {
    at: new Date().toISOString(),
    previous_total: n2(Number(promo.total_price) || 0),
    previous_price_per_passenger: n2(Number(promo.price_per_passenger) || 0),
    new_total: total,
    new_price_per_passenger: n2(perPax),
    ...(novaCia ? { previous_airline_iata: promo.airline_iata ?? null, new_airline_iata: novaCia.iata } : {}),
  };
  // promoção 100% manual: mantém os trechos digitados coerentes com a nova cia
  if (novaCia) {
    const manual = raw.manual as { legs?: Array<Record<string, unknown>> } | undefined;
    if (manual?.legs?.length) {
      manual.legs = manual.legs.map((l) => ({ ...l, airlineIata: novaCia.iata }));
      raw.manual = manual;
    }
  }

  const { error: upErr } = await client
    .from("airfare_promotions")
    .update({
      fare_price: fare,
      taxes,
      total_price: total,
      price_per_passenger: n2(perPax),
      airline_iata: airlineIata,
      airline_name: airlineName,
      ...(novaCia ? { airline_logo: novaCia.logo ?? null } : {}),
      inbound_airline_iata: inboundIata,
      inbound_airline_name: inboundName,
      ...(novaCia ? { inbound_airline_logo: promo.inbound_airline_iata ? (novaCia.logo ?? null) : null } : {}),

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
      fare_status: "valida",
      unavailable_at: null,
      raw,
      // preço mudou → o link precisa ser regerado com o valor novo
      cart_url: null,
      short_url: null,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (upErr) throw new Error(upErr.message);

  return {
    id: input.id,
    totalPrice: total,
    pricePerPassenger: n2(perPax),
    interestFreeInstallments: cond.interestFree.installments,
    interestFreeInstallmentValue: n2(cond.interestFree.installmentValue),
  };
}
