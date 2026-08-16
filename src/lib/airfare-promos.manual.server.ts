/**
 * CURADORIA MANUAL — Passagens Baratas → Promoções de Aéreo.
 *
 * Segunda porta de entrada do pipeline: o administrador encontra a
 * oportunidade no explorador interno e clica em "Salvar". O preço mostrado
 * ali é apenas REFERÊNCIA — o preço comercial vem sempre do motor VIA AIR,
 * cotado no instante do clique. Depois da gravação, a promoção segue o
 * mesmo pipeline das automáticas (revalidação, histórico, links, arte).
 */
import { scopeOfRoute } from "@/lib/br-airports";
import { resolveCity } from "@/lib/iata-lookup";
import { curationDayBRT, diffFare } from "@/lib/airfare-promos.worker.server";

export type ManualOpportunityInput = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  referencePrice?: number | null;
  originCity?: string | null;
  destinationCity?: string | null;
  adults?: number;
};

export type ManualOpportunityResult =
  | { ok: false; reason: "no_fare" }
  | {
      ok: true;
      created: boolean;
      promotionId: string;
      totalPrice: number;
      referencePrice: number | null;
      difference: number | null;
      differencePercent: number | null;
      originCity: string;
      destinationCity: string;
      /** códigos que não puderam ser resolvidos para nome comercial */
      unresolvedCities: string[];
    };

export async function saveManualOpportunity(
  input: ManualOpportunityInput,
): Promise<ManualOpportunityResult> {
  const origin = input.origin.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();
  const returnDate = input.returnDate?.trim() || null;
  const ref = input.referencePrice != null ? Number(input.referencePrice) : null;

  // Normalização ANTES de cotar: IATA é código técnico, o nome comercial da
  // cidade é o que alimenta card, WhatsApp, arte e busca de imagem.
  const orig = resolveCity(origin, input.originCity);
  const dest = resolveCity(destination, input.destinationCity);
  const unresolvedCities = [
    ...(orig.resolved ? [] : [orig.iata]),
    ...(dest.resolved ? [] : [dest.iata]),
  ];

  const { loadMarkups, quoteRoute } = await import("@/lib/airfare-promos.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as never as {
    from: (t: string) => any;
  };
  const markups = await loadMarkups(supabaseAdmin as never);

  let row: Awaited<ReturnType<typeof quoteRoute>> | null = null;
  try {
    row = await quoteRoute({
      route: {
        id: "passagens-baratas",
        origin_iata: origin,
        origin_city: orig.resolved ? orig.name : null,
        destination_iata: destination,
        destination_city: dest.resolved ? dest.name : null,
        scope: scopeOfRoute(origin, destination),
        priority: 0,
      },
      departureDate: input.departureDate,
      returnDate,
      markups,
      referencePrice: ref,
      adults: input.adults ?? 1,

    });
  } catch {
    row = null;
  }
  if (!row) return { ok: false, reason: "no_fare" };

  const viaair = Number(row.total_price);
  const hoje = curationDayBRT();

  const { data: anterior } = await client
    .from("airfare_promotions")
    .select(
      "id,total_price,airline_iata,outbound_fare_id,inbound_fare_id,outbound_itinerary_id,inbound_itinerary_id,stops,has_checked_baggage,interest_free_installments,interest_free_installment_value,cart_url,short_url,status,cycle_day",
    )
    .eq("signature", (row as { signature: string }).signature)
    .maybeSingle();

  const camposMudados = anterior ? diffFare(anterior as never, row as never) : [];
  const mudou = camposMudados.length > 0;
  const jaNoCicloDeHoje = !!anterior && (anterior as { cycle_day?: string | null }).cycle_day === hoje;
  const cycleState = !jaNoCicloDeHoje ? "new" : mudou ? "changed" : "unchanged";

  const payload: Record<string, unknown> = {
    ...(row as unknown as Record<string, unknown>),
    // origem interna da oportunidade (auditoria — não aparece no card)
    reference_source: "passagens_baratas",
    reference_price: ref,
    reference_origin: origin,
    reference_destination: destination,
    reference_departure_date: input.departureDate,
    reference_return_date: returnDate,
    reference_collected_at: new Date().toISOString(),
    price_difference: ref != null ? Number((viaair - ref).toFixed(2)) : null,
    price_difference_percent: ref ? Number((((viaair - ref) / ref) * 100).toFixed(2)) : null,
    fare_status: "valida",
    unavailable_at: null,
    archived_at: null,
    archived_reason: null,
    archived_cycle_day: null,
    cycle_day: hoje,
    cycle_state: cycleState,
    cycle_changed_fields: cycleState === "changed" ? camposMudados : [],
    cycle_state_at: cycleState === "unchanged" ? null : new Date().toISOString(),
  };

  if (anterior) {
    payload.status = (anterior as { status?: string }).status ?? "novo";
    if (mudou) {
      // nunca divulgar carrinho/link de uma tarifa anterior
      payload.cart_url = null;
      payload.short_url = null;
    }
  } else {
    payload.status = "novo";
  }

  const { data: salvo, error } = await client
    .from("airfare_promotions")
    .upsert(payload, { onConflict: "signature" })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  const promotionId = (salvo as { id: string } | null)?.id ?? (anterior as { id: string } | null)?.id ?? "";

  if (promotionId && (!anterior || mudou)) {
    try {
      const antes = anterior ? Number((anterior as { total_price: number }).total_price) : null;
      await client.from("airfare_promo_price_history").insert({
        promotion_id: promotionId,
        old_price: antes,
        new_price: viaair,
        reference_price: ref,
        reason: !anterior
          ? "nova"
          : antes === viaair
            ? "nova_tarifa"
            : viaair < (antes ?? 0)
              ? "preco_caiu"
              : "preco_subiu",
        source: "passagens_baratas",
      });
    } catch {
      /* histórico é best-effort */
    }
  }

  return {
    ok: true,
    created: !anterior,
    promotionId,
    totalPrice: viaair,
    referencePrice: ref,
    difference: ref != null ? Number((viaair - ref).toFixed(2)) : null,
    differencePercent: ref ? Number((((viaair - ref) / ref) * 100).toFixed(2)) : null,
    originCity: orig.name,
    destinationCity: dest.name,
    unresolvedCities,
  };
}
