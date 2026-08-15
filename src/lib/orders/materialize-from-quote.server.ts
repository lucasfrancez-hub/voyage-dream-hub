/**
 * Materialização de PEDIDO a partir de um ORÇAMENTO.
 *
 * O gatilho `materialize_order_from_snapshot` do banco só entende o formato
 * antigo de pacote (`outbound_flight`, `hotel_name`...). Orçamentos importados
 * e o checkout público usam outro formato, então o pedido nascia sem
 * hospedagem, sem aéreo e sem financeiro. Aqui criamos os itens
 * (`order_items`), o financeiro de cada item (`order_item_financials`) e os
 * passageiros explicitamente.
 */

import type { NormalizedOption } from "@/lib/quotes/types";
import type { PublicQuote, QuoteProducts } from "@/lib/public-quote/types";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

type ItemDraft = {
  kind: "flight" | "hotel" | "service" | "transfer" | "insurance" | "ticket" | "car" | "activity";
  title: string;
  details: Record<string, unknown>;
  /** Valor de venda do item (quando o orçamento discrimina). */
  saleValue?: number | null;
};

function onlyDate(v?: string | null): string | null {
  const m = String(v ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Insere itens + financeiro, sem duplicar caso o pedido já tenha itens. */
async function persist(
  supabaseAdmin: Admin,
  orderId: string,
  drafts: ItemDraft[],
  supplierName: string | null,
  fallbackTotal: number,
): Promise<number> {
  if (!drafts.length) return 0;

  const { data: existentes } = await supabaseAdmin
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .limit(1);
  if (existentes?.length) return 0;

  const { data: inseridos, error } = await supabaseAdmin
    .from("order_items")
    .insert(
      drafts.map((d, i) => ({
        order_id: orderId,
        kind: d.kind,
        status: "pending",
        title: d.title,
        details: d.details as never,
        sort_order: i,
      })),
    )
    .select("id, sort_order");
  if (error || !inseridos) throw new Error(error?.message ?? "Falha ao criar itens do pedido");
  inseridos.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Quando o orçamento não discrimina valores por item, o total vai no
  // primeiro item para o financeiro nunca nascer zerado.
  const discriminado = drafts.some((d) => num(d.saleValue) > 0);
  const financeiro = inseridos.map((row, i) => {
    const sale = discriminado
      ? num(drafts[i]?.saleValue)
      : i === 0
        ? num(fallbackTotal)
        : 0;
    return {
      order_item_id: row.id,
      supplier_name: supplierName,
      sale_value: sale,
      discount_value: 0,
      tax_value: 0,
      commission_pct: 0,
      commission_value: 0,
      rav_value: 0,
      exchange_rate: 1,
      is_commissionable: true,
      total: sale,
      sort_order: i,
    };
  });
  await supabaseAdmin.from("order_item_financials").insert(financeiro as never);
  return inseridos.length;
}

/** Itens a partir de uma opção do orçamento importado (formato normalizado). */
function draftsFromNormalized(option: NormalizedOption): ItemDraft[] {
  const drafts: ItemDraft[] = [];

  option.hotels?.forEach((h) => {
    drafts.push({
      kind: "hotel",
      title: `${h.name}${h.nights ? ` — ${h.nights} noites` : ""}`,
      saleValue: h.total ?? null,
      details: {
        hotel_name: h.name,
        destination: h.city ?? option.destination ?? null,
        address: h.address ?? null,
        nights: h.nights ?? null,
        meal_plan: h.board ?? null,
        room_type: h.roomDescription ?? null,
        check_in: onlyDate(h.checkin) ?? onlyDate(option.startDate),
        check_out: onlyDate(h.checkout) ?? onlyDate(option.endDate),
      },
    });
  });

  option.flights?.forEach((f, fi) => {
    const grupo = `tg-quote-${option.optionNumber}-${fi}`;
    const direction = f.direction === "INBOUND" ? "return" : "outbound";
    const segs = f.segments?.length ? f.segments : [null];
    segs.forEach((s, si) => {
      const airline = s?.airline ?? f.airline ?? "Voo";
      const from = s?.fromIata ?? f.fromIata ?? "";
      const to = s?.toIata ?? f.toIata ?? "";
      drafts.push({
        kind: "flight",
        title: `${airline} ${s?.flightNumber ?? ""} — ${from} → ${to}`.replace(/\s+/g, " ").trim(),
        saleValue: si === 0 ? (f.total ?? null) : null,
        details: {
          airline,
          airline_code: s?.airlineIata ?? null,
          flight_number: s?.flightNumber ?? null,
          from_iata: from,
          to_iata: to,
          depart_at: s?.departure ?? f.departure ?? null,
          arrive_at: s?.arrival ?? f.arrival ?? null,
          cabin_class: s?.cabin ?? null,
          direction,
          trip_group: grupo,
          segment_index: si,
        },
      });
    });
  });

  const genericos: Array<[ItemDraft["kind"], NormalizedOption["services"]]> = [
    ["car", option.cars],
    ["transfer", option.transfers],
    ["activity", option.activities],
    ["ticket", option.tickets],
    ["insurance", option.insurance],
    ["service", option.services],
  ];
  genericos.forEach(([kind, lista]) => {
    lista?.forEach((g) => {
      drafts.push({
        kind,
        title: g.name,
        saleValue: g.total ?? null,
        details: {
          name: g.name,
          description: g.description ?? null,
          date: onlyDate(g.date),
          quantity: g.quantity ?? null,
        },
      });
    });
  });

  return drafts;
}

/** Itens a partir dos produtos do orçamento público (checkout). */
function draftsFromPublicProducts(products: QuoteProducts, destino?: string | null): ItemDraft[] {
  const drafts: ItemDraft[] = [];

  products.hotels?.forEach((h) => {
    drafts.push({
      kind: "hotel",
      title: h.name,
      details: {
        hotel_name: h.name,
        hotel_stars: h.stars ?? null,
        destination: h.place ?? destino ?? null,
        address: h.location?.address ?? null,
        meal_plan: h.mealPlan ?? null,
        room_type: h.roomName ?? h.roomDescription ?? null,
        check_in: h.checkIn ?? null,
        check_out: h.checkOut ?? null,
        occupancy: h.occupancy ?? null,
      },
    });
  });

  products.flights?.forEach((fp, fi) => {
    fp.legs.forEach((leg, li) => {
      const grupo = `tg-quote-${fi}-${li}`;
      const direction = leg.direction === "INBOUND" ? "return" : "outbound";
      leg.segments.forEach((s, si) => {
        drafts.push({
          kind: "flight",
          title: `${s.airline} ${s.flightNumber ?? ""} — ${s.fromIata} → ${s.toIata}`
            .replace(/\s+/g, " ")
            .trim(),
          details: {
            airline: s.airline,
            airline_code: s.airlineIata ?? null,
            flight_number: s.flightNumber ?? null,
            from_iata: s.fromIata,
            to_iata: s.toIata,
            from_city: s.fromName ?? null,
            to_city: s.toName ?? null,
            depart_at: s.departure,
            arrive_at: s.arrival,
            cabin_class: leg.cabin ?? null,
            checked_bag: !!leg.checkedBaggage,
            direction,
            trip_group: grupo,
            segment_index: si,
          },
        });
      });
    });
  });

  const genericos: Array<[ItemDraft["kind"], typeof products.services]> = [
    ["car", products.cars],
    ["transfer", products.transfers],
    ["activity", products.activities],
    ["ticket", products.tickets],
    ["insurance", products.insurance],
    ["service", products.services],
  ];
  genericos.forEach(([kind, lista]) => {
    lista?.forEach((g) => {
      drafts.push({
        kind,
        title: g.title,
        details: {
          name: g.title,
          description: g.summary ?? g.description ?? null,
          details: g.details ?? [],
        },
      });
    });
  });

  return drafts;
}

/** Conversão de orçamento importado em pedido (admin). */
export async function materializeOrderFromNormalizedOption(
  orderId: string,
  option: NormalizedOption,
  opts: { supplierName?: string | null; total?: number | null },
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return persist(
    supabaseAdmin,
    orderId,
    draftsFromNormalized(option),
    opts.supplierName ?? null,
    num(opts.total ?? option.total),
  );
}

/** Checkout público: materializa o pedido criado a partir do link do orçamento. */
export async function materializeOrderFromPublicQuote(
  orderId: string,
  quote: PublicQuote,
  total: number,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const products =
    (quote as unknown as { products?: QuoteProducts }).products ??
    (quote as unknown as { options?: Array<{ products: QuoteProducts }> }).options?.[0]?.products ??
    {};
  return persist(
    supabaseAdmin,
    orderId,
    draftsFromPublicProducts(products, quote.destination),
    "Orçamento Via Air",
    num(total),
  );
}
