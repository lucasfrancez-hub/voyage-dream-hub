import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

// --------- Auto-title (resumo automático do pedido) ---------
// Gera um título curto para o pedido (para substituir "Pedido manual" na listagem).
// Regras: se order.trip_title está preenchido, usa-o. Caso contrário, resume itens via IA.
async function buildAutoTitle(context: { supabase: unknown }, orderId: string): Promise<string | null> {
  const sb = context.supabase as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
          neq: (c: string, v: string) => Promise<{ data: Array<Record<string, unknown>> | null }>;
        };
      };
    };
  };
  const ord = await sb.from("orders").select("trip_title").eq("id", orderId).maybeSingle();
  const tripTitle = (ord.data as { trip_title?: string | null } | null)?.trip_title;
  if (tripTitle && String(tripTitle).trim()) return String(tripTitle).trim().slice(0, 140);

  const it = await sb.from("order_items").select("kind, title, details, supplier_locator, status").eq("order_id", orderId).neq("status", "cancelled");
  const list = ((it.data as Array<{ kind: string; title: string | null; details: Record<string, unknown> | null; supplier_locator: string | null }>) ?? []);
  if (list.length === 0) return null;

  const flights = list.filter((i) => i.kind === "flight");
  const hotels = list.filter((i) => i.kind === "hotel");
  const others = list.filter((i) => i.kind !== "flight" && i.kind !== "hotel");

  // ---- Resumo inteligente de aéreos: colapsa conexões e detecta ida-e-volta ----
  // Cada item flight representa UM segmento (origem/destino). Agrupamos por
  // supplier_locator (uma jornada = um localizador) e reduzimos a pares
  // (primeira origem, último destino), colapsando aeroportos de conexão.
  const IATA_CITY: Record<string, string> = {
    GRU: "São Paulo", CGH: "São Paulo", VCP: "Campinas",
    GIG: "Rio de Janeiro", SDU: "Rio de Janeiro",
    BSB: "Brasília", CNF: "Belo Horizonte", PLU: "Belo Horizonte",
    CWB: "Curitiba", POA: "Porto Alegre", FLN: "Florianópolis",
    SSA: "Salvador", REC: "Recife", FOR: "Fortaleza", NAT: "Natal",
    MCZ: "Maceió", AJU: "Aracaju", THE: "Teresina", SLZ: "São Luís",
    BEL: "Belém", MAO: "Manaus", MGF: "Maringá", LDB: "Londrina",
    CGB: "Cuiabá", CGR: "Campo Grande", GYN: "Goiânia", VIX: "Vitória",
    IGU: "Foz do Iguaçu", NVT: "Navegantes", JPA: "João Pessoa",
    PMW: "Palmas", MCP: "Macapá", PVH: "Porto Velho", RBR: "Rio Branco",
    BVB: "Boa Vista", STM: "Santarém",
    // Internacionais comuns
    MIA: "Miami", MCO: "Orlando", JFK: "Nova York", LGA: "Nova York", EWR: "Newark",
    LAX: "Los Angeles", SFO: "São Francisco", ORD: "Chicago", IAH: "Houston",
    DFW: "Dallas", ATL: "Atlanta", BOS: "Boston", LAS: "Las Vegas",
    LIS: "Lisboa", OPO: "Porto", MAD: "Madri", BCN: "Barcelona",
    CDG: "Paris", ORY: "Paris", LHR: "Londres", LGW: "Londres",
    FCO: "Roma", MXP: "Milão", FRA: "Frankfurt", MUC: "Munique",
    AMS: "Amsterdã", ZRH: "Zurique", GVA: "Genebra",
    EZE: "Buenos Aires", AEP: "Buenos Aires", SCL: "Santiago", LIM: "Lima",
    BOG: "Bogotá", MEX: "Cidade do México", CUN: "Cancún",
    DXB: "Dubai", DOH: "Doha", IST: "Istambul",
  };
  const cityOf = (iata: string) => {
    const k = String(iata || "").toUpperCase().trim();
    return IATA_CITY[k] || k;
  };

  // Coleta TODOS os segmentos, ordena globalmente (por localizador + índice/horário)
  // e reduz para os extremos: primeira origem e última destinação.
  // Se a última destinação retorna à primeira origem → ida e volta.
  const allSegs: Array<{ orig: string; dest: string; locator: string; order: number; depart: string; idx: number }> = [];
  flights.forEach((f, idx) => {
    const d = (f.details ?? {}) as Record<string, unknown>;
    const orig = String(d.origin ?? d.from ?? d.origin_code ?? d.from_iata ?? "").toUpperCase();
    const dest = String(d.destination ?? d.to ?? d.destination_code ?? d.to_iata ?? "").toUpperCase();
    if (!orig || !dest) return;
    const orderVal = Number(d.segment_index ?? d.order ?? idx);
    const depart = String(d.depart_at ?? d.departure_at ?? d.departure ?? "");
    allSegs.push({ orig, dest, locator: f.supplier_locator || "", order: isFinite(orderVal) ? orderVal : idx, depart, idx });
  });
  allSegs.sort((a, b) => {
    if (a.locator !== b.locator) return a.locator.localeCompare(b.locator);
    if (a.depart && b.depart && a.depart !== b.depart) return a.depart < b.depart ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.idx - b.idx;
  });

  const parts: string[] = [];
  if (allSegs.length) {
    const firstOrig = allSegs[0].orig;
    const lastDest = allSegs[allSegs.length - 1].dest;
    if (firstOrig === lastDest && allSegs.length > 1) {
      // Ida e volta: ponto de virada = destino do segmento no meio da jornada.
      // Ex.: MGF→GRU, GRU→BEL, BEL→GRU, GRU→MGF → virada = BEL (segmento 2, cnt=4).
      const mid = Math.max(0, Math.floor(allSegs.length / 2) - 1);
      const turnaround = allSegs[mid]?.dest || allSegs[0].dest;
      parts.push(`Aéreo ${cityOf(firstOrig)} ⇄ ${cityOf(turnaround)}`);
    } else {
      parts.push(`Aéreo ${cityOf(firstOrig)} → ${cityOf(lastDest)}`);
    }
  } else if (flights.length) {
    parts.push(`Aéreo${flights.length > 1 ? ` (${flights.length})` : ""}`);
  }
  if (hotels.length) parts.push(hotels[0].title ? `Hospedagem ${hotels[0].title}` : "Hospedagem");
  if (others.length) parts.push(others[0].title || "Serviços");
  return parts.join(" + ").slice(0, 140) || null;

}

async function applyAutoTitle(context: { supabase: unknown }, orderId: string): Promise<void> {
  try {
    const sb = context.supabase as {
      from: (t: string) => {
        select: (s: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } };
        update: (p: unknown) => { eq: (c: string, v: string) => Promise<unknown> };
      };
    };
    const cur = await sb.from("orders").select("package_snapshot, trip_title").eq("id", orderId).maybeSingle();
    const row = (cur.data ?? {}) as { package_snapshot?: Record<string, unknown> | null; trip_title?: string | null };
    const snap = (row.package_snapshot ?? {}) as Record<string, unknown>;
    const tt = row.trip_title;
    // Se um fluxo externo (ex: importação de pacote) cravou snap.title "de verdade" e o usuário
    // não definiu trip_title, respeitamos o título existente.
    const hasExternalTitle = typeof snap.title === "string" && snap.title.trim() !== ""
      && snap.manual !== true && snap.auto_title !== true;
    if (hasExternalTitle && !(tt && String(tt).trim())) return;

    const title = await buildAutoTitle(context, orderId);
    if (!title) return;
    const next = { ...snap, title, auto_title: true, manual: false };
    await sb.from("orders").update({ package_snapshot: next as never }).eq("id", orderId);
  } catch (e) {
    console.error("[orders] applyAutoTitle falhou:", e);
  }
}



// --------- Types ---------
export type OrderLogEntry = { text: string; created_at: string; author?: string | null };

export type OrderPassenger = {
  id: string;
  order_id: string;
  full_name: string;
  passenger_type: "ADT" | "CHD" | "INF";
  birth_date: string | null;
  cpf: string | null;
  document: string | null;
  ticket_number: string | null;
  sort_order: number;
  doc_type: "cpf" | "passport";
  passport_number: string | null;
  passport_issue_date: string | null;
  passport_expiry_date: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  kind: "hotel" | "flight" | "other";
  status: "confirmed" | "reserved" | "cancelled" | "pending";
  title: string;
  supplier_locator: string | null;
  details: Json;
  sort_order: number;
};

export type OrderItemFinancial = {
  id: string;
  order_item_id: string;
  supplier_name: string | null;
  sale_value: number;
  tax_value: number;
  discount_value: number;

  commission_value: number;
  commission_pct: number;
  is_commissionable: boolean;
  rav_value: number;
  exchange_rate: number;
  due_date: string | null;
  total: number;
  notes: string | null;
  sort_order: number;
};

export type OrderHeader = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  fullName: string;
  email: string;
  phone: string;
  cpf: string | null;
  birthDate: string | null;
  payerBirthDate: string | null;
  adults: number;
  children: number;
  totalPrice: number;
  paymentMethod: string;
  notes: string | null;
  travelReason: string | null;
  coupon: string | null;
  notesLog: OrderLogEntry[];
  travelReasonLog: OrderLogEntry[];
  supplierName: string | null;
  supplierOrderNumber: string | null;
  supplierLogoUrl: string | null;
  airlineLocator: string | null;
  packageSnapshot: Json;
  tripTitle: string | null;
  sellerName: string | null;
  sellerEmail: string | null;
  sellerPhone: string | null;
  payerFullName: string | null;
  payerCpf: string | null;
  payerIeRg: string | null;

  payerEmail: string | null;
  payerPhone: string | null;
  payerZip: string | null;
  payerAddress: string | null;
  payerNumber: string | null;
  payerDistrict: string | null;
  payerCity: string | null;
  payerState: string | null;
  personId: string | null;
};


export type OrderPayment = {
  id: string;
  order_id: string;
  cashier_number: string | null;
  status: "paid" | "pending" | "cancelled" | "refunded" | string;
  method: string;
  description: string | null;
  installments: number | null;
  installment_amount: number | null;
  amount: number;
  provider: string | null;
  proposal_number: string | null;
  authorization_code: string | null;
  card_last4: string | null;
  card_bin: string | null;
  card_brand: string | null;
  card_expiry: string | null;
  paid_at: string | null;

  added_by_name: string | null;
  notes: string | null;
  order_item_ids: string[] | null;
  created_at: string;
};

export type OrderDetail = {
  order: OrderHeader;
  passengers: OrderPassenger[];
  items: OrderItem[];
  financials: OrderItemFinancial[];
  payments: OrderPayment[];
  itemPassengers: Record<string, string[]>; // order_item_id -> passenger_ids[]
};


// --------- getOrderDetail ---------
export const getOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<OrderDetail> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await supabase.rpc("has_role", { _user_id: userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }

    const { data: order, error: e1 } = await supabase
      .from("orders")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!order) throw new Error("Pedido não encontrado");

    // Materializa hospedagem/aéreo/passageiros a partir do snapshot do pacote (idempotente)
    await supabase.rpc("materialize_order_from_snapshot", { _order_id: data.id });

    // Enriquece packageSnapshot com outbound_flight/return_flight do pacote (via slug),
    // pois o snapshot armazenado guarda apenas campos básicos e a UI precisa das
    // flags de bagagem e do logo da cia por trecho vindos do pacote pronto.
    try {
      const snap = (order.package_snapshot ?? {}) as Record<string, unknown>;
      const slug = typeof snap.slug === "string" ? snap.slug : null;
      const hasFlights = !!(snap.outbound_flight || snap.return_flight);
      if (slug && !hasFlights) {
        const { data: pkg } = await supabase
          .from("packages")
          .select("outbound_flight, return_flight")
          .eq("slug", slug)
          .maybeSingle();
        if (pkg) {
          (order as { package_snapshot: Record<string, unknown> }).package_snapshot = {
            ...snap,
            outbound_flight: (pkg as { outbound_flight?: unknown }).outbound_flight ?? null,
            return_flight: (pkg as { return_flight?: unknown }).return_flight ?? null,
          };
        }
      }
    } catch {
      // ignora — snapshot original permanece
    }



    const { data: passengers, error: e2 } = await supabase
      .from("order_passengers")
      .select("*")
      .eq("order_id", data.id)
      .order("sort_order", { ascending: true });
    if (e2) throw new Error(e2.message);

    const { data: items, error: e3 } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", data.id)
      .order("sort_order", { ascending: true });
    if (e3) throw new Error(e3.message);

    const itemIds = (items ?? []).map((i) => i.id);
    let financials: OrderItemFinancial[] = [];
    if (itemIds.length > 0) {
      const { data: fin, error: e4 } = await supabase
        .from("order_item_financials")
        .select("*")
        .in("order_item_id", itemIds)
        .order("sort_order", { ascending: true });
      if (e4) throw new Error(e4.message);
      financials = (fin ?? []).map((f) => ({
        id: f.id,
        order_item_id: f.order_item_id,
        supplier_name: f.supplier_name,
        sale_value: Number(f.sale_value),
        tax_value: Number((f as { tax_value?: number | string | null }).tax_value ?? 0),
        discount_value: Number(f.discount_value),

        commission_value: Number(f.commission_value),
        commission_pct: Number(f.commission_pct),
        is_commissionable: (f as { is_commissionable?: boolean | null }).is_commissionable ?? true,
        rav_value: Number((f as { rav_value?: number | string | null }).rav_value ?? 0),
        exchange_rate: Number(f.exchange_rate),
        due_date: f.due_date,
        total: Number(f.total),
        notes: f.notes,
        sort_order: f.sort_order,
      }));
    }

    const itemPassengers: Record<string, string[]> = {};
    if (itemIds.length > 0) {
      const { data: links, error: eL } = await supabase
        .from("order_item_passengers")
        .select("order_item_id, passenger_id")
        .in("order_item_id", itemIds);
      if (eL) throw new Error(eL.message);
      for (const l of links ?? []) {
        (itemPassengers[l.order_item_id] ??= []).push(l.passenger_id);
      }
    }

    const { data: paymentsRaw, error: e5 } = await supabase
      .from("order_payments")
      .select("*")
      .eq("order_id", data.id)
      .order("created_at", { ascending: true });
    if (e5) throw new Error(e5.message);
    const payments: OrderPayment[] = (paymentsRaw ?? []).map((p) => ({
      id: p.id,
      order_id: p.order_id,
      cashier_number: p.cashier_number,
      status: p.status,
      method: p.method,
      description: p.description,
      installments: p.installments,
      installment_amount: p.installment_amount === null ? null : Number(p.installment_amount),
      amount: Number(p.amount),
      provider: p.provider,
      proposal_number: p.proposal_number,
      authorization_code: p.authorization_code,
      card_last4: p.card_last4,
      card_bin: (p as { card_bin?: string | null }).card_bin ?? null,
      card_brand: p.card_brand,
      card_expiry: (p as { card_expiry?: string | null }).card_expiry ?? null,


      paid_at: p.paid_at,
      added_by_name: p.added_by_name,
      notes: p.notes,
      order_item_ids: (p as { order_item_ids?: string[] | null }).order_item_ids ?? null,
      created_at: p.created_at,
    }));

    return {
      order: {
        id: order.id,
        orderNumber: (order as { order_number?: string | null }).order_number ?? order.id.slice(0, 8).toUpperCase(),
        createdAt: order.created_at,
        status: order.status,
        fullName: order.full_name,
        email: order.email,
        phone: order.phone,
        cpf: order.cpf ?? null,
        birthDate: order.birth_date ?? null,
        payerBirthDate: (order as { payer_birth_date?: string | null }).payer_birth_date ?? null,

        adults: order.adults,
        children: order.children,
        totalPrice: Number(order.total_price),
        paymentMethod: order.payment_method,
        notes: order.notes,
        travelReason: (order as { travel_reason?: string | null }).travel_reason ?? null,
        coupon: (order as { coupon?: string | null }).coupon ?? null,
        notesLog: Array.isArray((order as { notes_log?: unknown }).notes_log) ? ((order as unknown as { notes_log: OrderLogEntry[] }).notes_log) : [],
        travelReasonLog: Array.isArray((order as { travel_reason_log?: unknown }).travel_reason_log) ? ((order as unknown as { travel_reason_log: OrderLogEntry[] }).travel_reason_log) : [],


        supplierName: order.supplier_name ?? null,
        supplierOrderNumber: order.supplier_order_number ?? null,
        supplierLogoUrl: (order as { supplier_logo_url?: string | null }).supplier_logo_url ?? null,
        airlineLocator: order.airline_locator ?? null,
        packageSnapshot: (order.package_snapshot ?? {}) as Json,
        tripTitle: (order as { trip_title?: string | null }).trip_title ?? null,
        sellerName: (order as { seller_name?: string | null }).seller_name ?? null,
        sellerEmail: (order as { seller_email?: string | null }).seller_email ?? null,
        sellerPhone: (order as { seller_phone?: string | null }).seller_phone ?? null,
        payerFullName: (order as { payer_full_name?: string | null }).payer_full_name ?? null,
        payerCpf: (order as { payer_cpf?: string | null }).payer_cpf ?? null,
        payerIeRg: (order as { payer_ie_rg?: string | null }).payer_ie_rg ?? null,

        payerEmail: (order as { payer_email?: string | null }).payer_email ?? null,
        payerPhone: (order as { payer_phone?: string | null }).payer_phone ?? null,
        payerZip: (order as { payer_zip?: string | null }).payer_zip ?? null,
        payerAddress: (order as { payer_address?: string | null }).payer_address ?? null,
        payerNumber: (order as { payer_number?: string | null }).payer_number ?? null,
        payerDistrict: (order as { payer_district?: string | null }).payer_district ?? null,
        payerCity: (order as { payer_city?: string | null }).payer_city ?? null,
        payerState: (order as { payer_state?: string | null }).payer_state ?? null,
        personId: (order as { person_id?: string | null }).person_id ?? null,
      },

      passengers: (passengers ?? []) as OrderPassenger[],
      items: (items ?? []).map((i) => ({
        id: i.id,
        order_id: i.order_id,
        kind: i.kind as OrderItem["kind"],
        status: i.status as OrderItem["status"],
        title: i.title,
        supplier_locator: i.supplier_locator,
        details: (i.details ?? {}) as Json,
        sort_order: i.sort_order,
      })),
      financials,
      payments,
      itemPassengers,
    };

  });

// --------- Passengers ---------
export const upsertPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<OrderPassenger> & { order_id: string; full_name: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const payload = {
      order_id: data.order_id,
      full_name: data.full_name,
      passenger_type: data.passenger_type ?? "ADT",
      birth_date: data.birth_date ?? null,
      cpf: data.cpf ?? null,
      document: data.document ?? null,
      ticket_number: data.ticket_number ?? null,
      sort_order: data.sort_order ?? 0,
      doc_type: data.doc_type ?? "cpf",
      passport_number: data.passport_number ?? null,
      passport_issue_date: data.passport_issue_date ?? null,
      passport_expiry_date: data.passport_expiry_date ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("order_passengers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("order_passengers")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deletePassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error } = await context.supabase.from("order_passengers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --------- Items ---------
export const upsertOrderItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<OrderItem> & { order_id: string; kind: OrderItem["kind"]; title: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const payload = {
      order_id: data.order_id,
      kind: data.kind,
      status: data.status ?? "confirmed",
      title: data.title,
      supplier_locator: data.supplier_locator ?? null,
      details: data.details ?? {},
      sort_order: data.sort_order ?? 0,
    };
    if (data.id) {
      const { error } = await context.supabase.from("order_items").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await applyAutoTitle(context, data.order_id);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("order_items")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await applyAutoTitle(context, data.order_id);
    return { id: created.id };
  });

export const deleteOrderItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { data: existing } = await context.supabase.from("order_items").select("order_id").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("order_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const oid = (existing as { order_id?: string } | null)?.order_id;
    if (oid) await applyAutoTitle(context, oid);
    return { ok: true };
  });

export const setOrderItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: OrderItem["status"] }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error } = await context.supabase.from("order_items").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Confirma ou cancela o pedido inteiro (status do pedido + status de todos os itens)
export const setOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "confirmed" | "reserved" | "cancelled" | "pending" | "paid" | "awaiting_signature" }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error: e1 } = await context.supabase.from("orders").update({ status: data.status }).eq("id", data.id);
    if (e1) throw new Error(e1.message);
    // Só sincroniza itens em transições manuais explícitas (confirmar/cancelar).
    // Status derivados (awaiting_signature, paid) não devem sobrescrever itens.
    if (data.status === "cancelled" || data.status === "confirmed") {
      const itemStatus = data.status === "cancelled" ? "cancelled" : "confirmed";
      const { error: e2 } = await context.supabase.from("order_items").update({ status: itemStatus }).eq("order_id", data.id);
      if (e2) throw new Error(e2.message);
    }
    return { ok: true };
  });

// Atualiza campos livres do pedido (observação, motivo, cupom)
export const updateOrderMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    notes?: string | null;
    travel_reason?: string | null;
    coupon?: string | null;
    trip_title?: string | null;
    seller_name?: string | null;
    seller_email?: string | null;
    seller_phone?: string | null;
    supplier_logo_url?: string | null;
    airline_locator?: string | null;
    supplier_order_number?: string | null;
    supplier_name?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const patch: Record<string, string | null> = {};
    const keys = ["notes", "travel_reason", "coupon", "trip_title", "seller_name", "seller_email", "seller_phone", "supplier_logo_url", "airline_locator", "supplier_order_number", "supplier_name"] as const;
    for (const k of keys) {
      const v = (data as Record<string, string | null | undefined>)[k];
      if (v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("orders").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    if ("trip_title" in patch) await applyAutoTitle(context, data.id);
    return { ok: true };
  });

// Retorna dados do usuário logado (para pré-preencher o vendedor no pedido).
export const getMySellerInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .maybeSingle();
    const email = (claims as { email?: string } | null)?.email ?? null;
    return {
      name: (profile as { full_name?: string | null } | null)?.full_name ?? null,
      email,
      phone: (profile as { phone?: string | null } | null)?.phone ?? null,
    };
  });

// Recalcula os títulos automáticos de todos os pedidos existentes (backfill).
export const backfillAutoTitles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => { select: (s: string) => Promise<{ data: Array<{ id: string }> | null }> };
    };
    const { data } = await sb.from("orders").select("id");
    const ids = (data ?? []).map((o) => o.id);
    let updated = 0;
    for (const id of ids) {
      try { await applyAutoTitle(context as unknown as { supabase: unknown }, id); updated++; } catch (e) { console.error(e); }
    }
    return { ok: true, total: ids.length, updated };
  });

// Atualiza dados do pagador (usados em contrato e recibo).
export const updateOrderPayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    payer_full_name?: string | null;
    payer_cpf?: string | null;
    payer_ie_rg?: string | null;
    payer_email?: string | null;
    payer_phone?: string | null;
    payer_zip?: string | null;
    payer_address?: string | null;
    payer_number?: string | null;
    payer_district?: string | null;
    payer_city?: string | null;
    payer_state?: string | null;
    payer_birth_date?: string | null;
    person_id?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const patch: Record<string, string | null> = {};
    const keys = [
      "payer_full_name", "payer_cpf", "payer_ie_rg", "payer_email", "payer_phone",
      "payer_zip", "payer_address", "payer_number", "payer_district", "payer_city", "payer_state",
      "payer_birth_date", "person_id",
    ] as const;
    for (const k of keys) {
      const v = (data as Record<string, string | null | undefined>)[k];
      if (v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("orders").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// Adiciona/remove entradas nos históricos (observações / motivos de viagem).
export const appendOrderLogEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; key: "notes_log" | "travel_reason_log"; text: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const text = data.text.trim();
    if (!text) throw new Error("Texto vazio");
    const { data: row, error: e1 } = await context.supabase.from("orders").select(data.key).eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    const current = Array.isArray((row as unknown as Record<string, unknown>)[data.key]) ? ((row as unknown as Record<string, OrderLogEntry[]>)[data.key]) : [];
    const entry: OrderLogEntry = { text, created_at: new Date().toISOString() };
    const next = [...current, entry];
    const { error: e2 } = await context.supabase.from("orders").update({ [data.key]: next } as never).eq("id", data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const deleteOrderLogEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; key: "notes_log" | "travel_reason_log"; index: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { data: row, error: e1 } = await context.supabase.from("orders").select(data.key).eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    const current = Array.isArray((row as unknown as Record<string, unknown>)[data.key]) ? ((row as unknown as Record<string, OrderLogEntry[]>)[data.key]) : [];
    const next = current.filter((_, i) => i !== data.index);
    const { error: e2 } = await context.supabase.from("orders").update({ [data.key]: next } as never).eq("id", data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });


// Atualiza somente o total_price do pedido (usado no ajuste de comissão).
export const updateOrderTotalPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; total_price: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error } = await context.supabase
      .from("orders")
      .update({ total_price: Number(data.total_price) } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Recalcula o cabeçalho a partir do pacote e dos itens adicionais ativos.
// Itens com details.value são adicionais avulsos; o valor informado já inclui as taxas.
export const recalculateOrderTotal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }

    const { data: order, error: orderError } = await context.supabase
      .from("orders")
      .select("id, adults, children, package_snapshot")
      .eq("id", data.id)
      .single();
    if (orderError) throw new Error(orderError.message);

    const { data: items, error: itemsError } = await context.supabase
      .from("order_items")
      .select("id, details")
      .eq("order_id", data.id)
      .neq("status", "cancelled");
    if (itemsError) throw new Error(itemsError.message);

    const itemIds = (items ?? []).map((item) => item.id);
    let financials: Array<{
      order_item_id: string;
      commission_pct: number | string | null;
      total: number | string | null;
      sale_value: number | string | null;
      tax_value: number | string | null;
      discount_value: number | string | null;
      rav_value: number | string | null;
    }> = [];
    if (itemIds.length > 0) {
      const { data: rows, error: financialError } = await context.supabase
        .from("order_item_financials")
        .select("order_item_id, commission_pct, total, sale_value, tax_value, discount_value, rav_value")
        .in("order_item_id", itemIds);
      if (financialError) throw new Error(financialError.message);
      financials = rows ?? [];
    }

    const snapshot = (order.package_snapshot ?? {}) as Record<string, unknown>;
    const packagePrice = Number(snapshot.price_per_person ?? 0) || 0;
    const isPackage =
      snapshot.manual !== true &&
      !["payment_link", "payment_link_simple"].includes(String(snapshot.kind ?? "")) &&
      packagePrice > 0;
    const pax = Math.max(1, Number(order.adults || 0) + Number(order.children || 0));

    const pricedItems = (items ?? []).map((item) => {
      const details = (item.details ?? {}) as Record<string, unknown>;
      const gross = Math.max(0, Number(details.value ?? 0) || 0);
      const tax = Math.max(0, Math.min(gross, Number(details.tax_value ?? 0) || 0));
      return { id: item.id, gross, tax };
    });

    // Regra única: total do item = tarifa + taxas − desconto + RAV.
    // Espelha exatamente o cálculo do card "Total venda" no Financeiro
    // para o cabeçalho nunca divergir. Se o item ainda não tem lançamento
    // financeiro, usa o valor bruto do próprio item (details.value).
    const itemNet = (id: string, gross: number) => {
      const saved = financials.find((row) => row.order_item_id === id);
      if (!saved) return gross;
      const sale = Number(saved.sale_value ?? 0) || 0;
      const tax = Number(saved.tax_value ?? 0) || 0;
      const disc = Number(saved.discount_value ?? 0) || 0;
      const rav = Number(saved.rav_value ?? 0) || 0;
      return Number((sale + tax - disc + rav).toFixed(2));
    };

    let total = 0;
    if (isPackage) {
      const packageTotal = packagePrice * pax;
      const packageTaxes = Math.max(0, Number(snapshot.taxes ?? 0) || 0);
      const packageFare = Math.max(0, packageTotal - packageTaxes);
      const pricedIds = new Set(pricedItems.filter((item) => item.gross > 0).map((item) => item.id));
      const packageRows = financials.filter((row) => !pricedIds.has(row.order_item_id));
      const pct = packageRows[0] && packageRows.every((row) => Number(row.commission_pct ?? 12) === Number(packageRows[0].commission_pct ?? 12))
        ? Number(packageRows[0].commission_pct ?? 12)
        : 12;
      const defaultCommission = Number((packageFare * 0.12).toFixed(2));
      const currentCommission = Number((packageFare * (pct / 100)).toFixed(2));
      const commissionDelta = Number((currentCommission - defaultCommission).toFixed(2));
      const ravTax = Number((Math.max(0, commissionDelta) * 0.15).toFixed(2));
      const extras = pricedItems.reduce((sum, item) => {
        if (item.gross <= 0) return sum;
        return sum + itemNet(item.id, item.gross);
      }, 0);
      total = packageTotal + commissionDelta + extras - ravTax;
    } else {
      total = pricedItems.reduce((sum, item) => sum + itemNet(item.id, item.gross), 0);
    }


    const rounded = Math.max(0, Number(total.toFixed(2)));
    const { error: updateError } = await context.supabase
      .from("orders")
      .update({ total_price: rounded } as never)
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);
    return { total_price: rounded };
  });






// --------- Financials ---------
export const upsertItemFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: Partial<OrderItemFinancial> & { order_item_id: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const payload = {
      order_item_id: data.order_item_id,
      supplier_name: data.supplier_name ?? null,
      sale_value: data.sale_value ?? 0,
      tax_value: data.tax_value ?? 0,
      discount_value: data.discount_value ?? 0,
      commission_value: data.commission_value ?? 0,
      commission_pct: data.commission_pct ?? 0,
      is_commissionable: data.is_commissionable ?? true,
      rav_value: data.rav_value ?? 0,
      exchange_rate: data.exchange_rate ?? 1,
      due_date: data.due_date && data.due_date !== "" ? data.due_date : null,
      total: data.total ?? 0,
      notes: data.notes ?? null,
      sort_order: data.sort_order ?? 0,
    } as never;

    if (data.id) {
      const { error } = await context.supabase.from("order_item_financials").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("order_item_financials")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteItemFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error } = await context.supabase.from("order_item_financials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Retorna o primeiro financeiro (menor sort_order) de um item — usado pelo
// import de voucher para atualizar em vez de duplicar em reimportação.
export const getFirstFinancialForItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_item_id: string }) => input)
  .handler(async ({ data, context }) => {
    const res = await context.supabase
      .from("order_item_financials")
      .select("id, commission_pct")
      .eq("order_item_id", data.order_item_id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = res.data as { id?: string; commission_pct?: number | string | null } | null;
    return { id: row?.id ?? null, commission_pct: row?.commission_pct ?? null };
  });

// --------- Payments ---------
export const upsertOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<OrderPayment> & { order_id: string; method: string; amount: number; card_full_number?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const payload: Record<string, unknown> = {
      order_id: data.order_id,
      cashier_number: data.cashier_number ?? null,
      status: data.status ?? "paid",
      method: data.method,
      description: data.description ?? null,
      installments: data.installments ?? null,
      installment_amount: data.installment_amount ?? null,
      amount: data.amount,
      provider: data.provider ?? null,
      proposal_number: data.proposal_number ?? null,
      authorization_code: data.authorization_code ?? null,
      card_last4: data.card_last4 ?? null,
      card_bin: data.card_bin ?? null,
      card_brand: data.card_brand ?? null,
      card_expiry: data.card_expiry ?? null,
      paid_at: data.paid_at ?? null,
      added_by_name: data.added_by_name ?? null,
      notes: data.notes ?? null,
      order_item_ids: (data.order_item_ids && data.order_item_ids.length > 0) ? data.order_item_ids : null,
    };
    // Cifra o número completo do cartão se enviado
    const raw = (data.card_full_number ?? "").replace(/\D/g, "");
    if (raw.length >= 12) {
      const { encryptCardNumber } = await import("./card-crypto.server");
      payload.card_number_enc = encryptCardNumber(raw);
      payload.card_bin = raw.slice(0, 6);
      payload.card_last4 = raw.slice(-4);
    }

    if (data.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await context.supabase.from("order_payments").update(payload as any).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    // Pagamento manual novo: "Incluído por" default = nome completo do usuário logado (fallback e-mail)
    if (!payload.added_by_name) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("full_name")
        .eq("id", context.userId)
        .maybeSingle();
      const email = (context.claims as { email?: string } | undefined)?.email ?? null;
      payload.added_by_name = (prof?.full_name && prof.full_name.trim()) ? prof.full_name : email;
    }
    const { data: created, error } = await context.supabase
      .from("order_payments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const revealOrderPaymentCardNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { data: row, error } = await context.supabase
      .from("order_payments")
      .select("card_number_enc")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enc = (row as any)?.card_number_enc as string | null | undefined;
    if (!enc) return { number: null as string | null };
    const { decryptCardNumber } = await import("./card-crypto.server");
    return { number: decryptCardNumber(enc) };
  });

export const deleteOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error } = await context.supabase.from("order_payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// --------- createOrder (cadastro manual) ---------
export type CreateOrderInput = {
  full_name: string;
  email: string;
  phone: string;
  cpf?: string | null;
  payment_method: string;
  total_price?: number;
  adults?: number;
  children?: number;
  notes?: string | null;
  supplier_name?: string | null;
  airline_locator?: string | null;
  person_id?: string | null;
  birth_date?: string | null;
  payer_full_name?: string | null;
  payer_cpf?: string | null;
  payer_ie_rg?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
  payer_birth_date?: string | null;
  payer_zip?: string | null;
  payer_address?: string | null;
  payer_number?: string | null;
  payer_district?: string | null;
  payer_city?: string | null;
  payer_state?: string | null;
};

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateOrderInput) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const nn = (v?: string | null) => (v && String(v).trim() !== "" ? v : null);
    const payload: Record<string, unknown> = {
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      cpf: nn(data.cpf),
      payment_method: data.payment_method,
      total_price: data.total_price ?? 0,
      adults: data.adults ?? 1,
      children: data.children ?? 0,
      notes: nn(data.notes),
      supplier_name: nn(data.supplier_name),
      airline_locator: nn(data.airline_locator),
      person_id: nn(data.person_id),
      birth_date: nn(data.birth_date),
      payer_full_name: nn(data.payer_full_name),
      payer_cpf: nn(data.payer_cpf),
      payer_ie_rg: nn(data.payer_ie_rg),
      payer_email: nn(data.payer_email),
      payer_phone: nn(data.payer_phone),
      payer_birth_date: nn(data.payer_birth_date),
      payer_zip: nn(data.payer_zip),
      payer_address: nn(data.payer_address),
      payer_number: nn(data.payer_number),
      payer_district: nn(data.payer_district),
      payer_city: nn(data.payer_city),
      payer_state: nn(data.payer_state),
      status: "pending",
      package_snapshot: { manual: true },
    };
    const { data: created, error } = await context.supabase
      .from("orders")
      .insert(payload as never)
      .select("id, order_number")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id, order_number: created.order_number };
  });

// --------- Item ↔ Passenger links ---------
export const linkPassengerToItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string; order_item_id: string; passenger_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error } = await context.supabase
      .from("order_item_passengers")
      .upsert(
        { order_id: data.order_id, order_item_id: data.order_item_id, passenger_id: data.passenger_id },
        { onConflict: "order_item_id,passenger_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unlinkPassengerFromItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_item_id: string; passenger_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error } = await context.supabase
      .from("order_item_passengers")
      .delete()
      .eq("order_item_id", data.order_item_id)
      .eq("passenger_id", data.passenger_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Após importar uma reserva, os triggers auto-linkam novos passageiros a todos
 * os itens existentes e novos itens a todos os passageiros existentes. Esta fn
 * corrige isso: apaga os links espúrios e mantém somente novos_pax × novos_itens.
 */
export const setImportLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string; item_ids: string[]; passenger_ids: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
      const { data: ownsOrder, error: ownerError } = await context.supabase.rpc("is_partner_order_owner", {
        _order_id: data.order_id,
      });
      if (ownerError || !ownsOrder) throw new Error("Forbidden");
    }
    if (data.item_ids.length === 0 || data.passenger_ids.length === 0) return { ok: true };

    // Valida os IDs antes de usar o cliente privilegiado. A operação abaixo precisa
    // ignorar RLS porque o trigger SECURITY DEFINER cria vínculos que podem ficar
    // invisíveis para a sessão durante a mesma importação.
    const [{ data: validItems, error: itemsError }, { data: validPassengers, error: passengersError }] = await Promise.all([
      context.supabase.from("order_items").select("id").eq("order_id", data.order_id).in("id", data.item_ids),
      context.supabase.from("order_passengers").select("id").eq("order_id", data.order_id).in("id", data.passenger_ids),
    ]);
    if (itemsError) throw new Error(itemsError.message);
    if (passengersError) throw new Error(passengersError.message);
    if ((validItems ?? []).length !== new Set(data.item_ids).size) throw new Error("Item importado inválido");
    if ((validPassengers ?? []).length !== new Set(data.passenger_ids).size) throw new Error("Passageiro importado inválido");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Remove novos_itens × qualquer passageiro e novos_passageiros × itens
    // antigos. As duas condições em uma única exclusão impedem vínculo residual.
    const { error: deleteNewItemsError } = await supabaseAdmin
      .from("order_item_passengers")
      .delete()
      .in("order_item_id", data.item_ids);
    if (deleteNewItemsError) throw new Error(deleteNewItemsError.message);

    const { error: deleteNewPassengersError } = await supabaseAdmin
      .from("order_item_passengers")
      .delete()
      .eq("order_id", data.order_id)
      .in("passenger_id", data.passenger_ids);
    if (deleteNewPassengersError) throw new Error(deleteNewPassengersError.message);

    // 2) Recria somente novos_passageiros × novos_itens.
    const rows = data.item_ids.flatMap((iid) =>
      data.passenger_ids.map((pid) => ({
        order_id: data.order_id,
        order_item_id: iid,
        passenger_id: pid,
      })),
    );
    const { error: insErr } = await supabaseAdmin
      .from("order_item_passengers")
      .upsert(rows, { onConflict: "order_item_id,passenger_id", ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);

    // Não conclui a importação se o resultado persistido divergir do esperado.
    const { data: persistedLinks, error: verifyError } = await supabaseAdmin
      .from("order_item_passengers")
      .select("order_item_id, passenger_id")
      .in("order_item_id", data.item_ids);
    if (verifyError) throw new Error(verifyError.message);
    if ((persistedLinks ?? []).length !== rows.length) {
      throw new Error("Não foi possível isolar os passageiros desta reserva");
    }

    return { ok: true };
  });

export const deleteAllOrderPassengers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }
    const { error } = await context.supabase
      .from("order_passengers")
      .delete()
      .eq("order_id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


