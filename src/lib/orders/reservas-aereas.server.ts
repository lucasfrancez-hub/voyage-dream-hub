/**
 * Lista as reservas aéreas que vieram dos PEDIDOS (não da consolidadora),
 * para aparecerem junto das reservas/bilhetes da PassHub com filtro de origem.
 */

import type { ReservaAereaPedido } from "./reservas-aereas.types";
export type { ReservaAereaPedido };

type Det = Record<string, unknown>;
const s = (v: unknown): string => String(v ?? "").trim();

export async function listarReservasAereasDePedidos(): Promise<ReservaAereaPedido[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, full_name, payer_full_name, seller_name, airline_locator, status, total_price, created_at, order_items(id, kind, status, title, sort_order, supplier_locator, details), order_passengers(full_name, ticket_number, tickets, sort_order)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message);

  const linhas: ReservaAereaPedido[] = [];

  for (const o of orders ?? []) {
    const voos = (o.order_items ?? [])
      .filter((i) => i.kind === "flight" && i.status !== "cancelled")
      .sort((a, b) => a.sort_order - b.sort_order);
    if (!voos.length) continue;

    const dets = voos.map((v) => (v.details ?? {}) as Det);
    const locadores = Array.from(
      new Set(
        voos
          .flatMap((v, i) => [s(dets[i].carrier_locator), s(v.supplier_locator)])
          .filter(Boolean)
          .map((x) => x.toUpperCase()),
      ),
    );
    const localizador = s(o.airline_locator).toUpperCase() || locadores[0] || "";
    if (!localizador) continue;

    const partidas = dets
      .map((d) => s(d.depart_at) || s(d.departure))
      .filter(Boolean)
      .sort();

    const pax = (o.order_passengers ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const bilhetes = pax
      .map((p) => {
        const map = (p.tickets ?? {}) as Record<string, string>;
        for (const loc of locadores) {
          const t = s(map[loc]);
          if (t) return t;
        }
        return s(Object.values(map).map(s).find(Boolean)) || s(p.ticket_number);
      })
      .filter(Boolean);

    linhas.push({
      orderId: o.id,
      orderNumber: o.order_number,
      cliente: s(o.full_name) || s(o.payer_full_name),
      consultor: s(o.seller_name),
      localizador,
      localizadorCompanhia: s(dets[0].carrier_locator).toUpperCase(),
      companhia: s(dets[0].airline) || s(dets[0].carrier),
      origem: (s(dets[0].from_iata) || s(dets[0].origin)).toUpperCase(),
      destino: (
        s(dets[dets.length - 1].to_iata) || s(dets[dets.length - 1].destination)
      ).toUpperCase(),
      dataIda: partidas[0] ?? "",
      dataVolta: partidas.length > 1 ? partidas[partidas.length - 1] : "",
      criadaEm: o.created_at,
      status: s(o.status),
      total: Number(o.total_price ?? 0),
      passageiros: pax.map((p) => s(p.full_name)).filter(Boolean),
      bilhetes,
    });
  }

  return linhas;
}
