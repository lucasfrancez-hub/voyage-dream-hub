import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

// --------- Types ---------
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
  adults: number;
  children: number;
  totalPrice: number;
  paymentMethod: string;
  notes: string | null;
  travelReason: string | null;
  coupon: string | null;
  supplierName: string | null;
  supplierOrderNumber: string | null;
  airlineLocator: string | null;
  packageSnapshot: Json;
  payerFullName: string | null;
  payerCpf: string | null;
  payerEmail: string | null;
  payerPhone: string | null;
  payerZip: string | null;
  payerAddress: string | null;
  payerNumber: string | null;
  payerDistrict: string | null;
  payerCity: string | null;
  payerState: string | null;
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
  card_brand: string | null;
  paid_at: string | null;
  added_by_name: string | null;
  notes: string | null;
  created_at: string;
};

export type OrderDetail = {
  order: OrderHeader;
  passengers: OrderPassenger[];
  items: OrderItem[];
  financials: OrderItemFinancial[];
  payments: OrderPayment[];
};


// --------- getOrderDetail ---------
export const getOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<OrderDetail> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: order, error: e1 } = await supabase
      .from("orders")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!order) throw new Error("Pedido não encontrado");

    // Materializa hospedagem/aéreo/passageiros a partir do snapshot do pacote (idempotente)
    await supabase.rpc("materialize_order_from_snapshot", { _order_id: data.id });



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
        exchange_rate: Number(f.exchange_rate),
        due_date: f.due_date,
        total: Number(f.total),
        notes: f.notes,
        sort_order: f.sort_order,
      }));
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
      card_brand: p.card_brand,
      paid_at: p.paid_at,
      added_by_name: p.added_by_name,
      notes: p.notes,
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
        adults: order.adults,
        children: order.children,
        totalPrice: Number(order.total_price),
        paymentMethod: order.payment_method,
        notes: order.notes,
        travelReason: (order as { travel_reason?: string | null }).travel_reason ?? null,
        coupon: (order as { coupon?: string | null }).coupon ?? null,

        supplierName: order.supplier_name ?? null,
        supplierOrderNumber: order.supplier_order_number ?? null,
        airlineLocator: order.airline_locator ?? null,
        packageSnapshot: (order.package_snapshot ?? {}) as Json,
        payerFullName: (order as { payer_full_name?: string | null }).payer_full_name ?? null,
        payerCpf: (order as { payer_cpf?: string | null }).payer_cpf ?? null,
        payerEmail: (order as { payer_email?: string | null }).payer_email ?? null,
        payerPhone: (order as { payer_phone?: string | null }).payer_phone ?? null,
        payerZip: (order as { payer_zip?: string | null }).payer_zip ?? null,
        payerAddress: (order as { payer_address?: string | null }).payer_address ?? null,
        payerNumber: (order as { payer_number?: string | null }).payer_number ?? null,
        payerDistrict: (order as { payer_district?: string | null }).payer_district ?? null,
        payerCity: (order as { payer_city?: string | null }).payer_city ?? null,
        payerState: (order as { payer_state?: string | null }).payer_state ?? null,
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
    };

  });

// --------- Passengers ---------
export const upsertPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<OrderPassenger> & { order_id: string; full_name: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
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
    if (!isAdmin) throw new Error("Forbidden");
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
    if (!isAdmin) throw new Error("Forbidden");
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
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("order_items")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteOrderItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("order_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOrderItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: OrderItem["status"] }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("order_items").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Confirma ou cancela o pedido inteiro (status do pedido + status de todos os itens)
export const setOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "confirmed" | "reserved" | "cancelled" | "pending" }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error: e1 } = await context.supabase.from("orders").update({ status: data.status }).eq("id", data.id);
    if (e1) throw new Error(e1.message);
    const itemStatus = data.status === "cancelled" ? "cancelled" : data.status === "confirmed" ? "confirmed" : "pending";
    const { error: e2 } = await context.supabase.from("order_items").update({ status: itemStatus }).eq("order_id", data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

// Atualiza campos livres do pedido (observação, motivo, cupom)
export const updateOrderMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; notes?: string | null; travel_reason?: string | null; coupon?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const patch: Record<string, string | null> = {};
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.travel_reason !== undefined) patch.travel_reason = data.travel_reason;
    if (data.coupon !== undefined) patch.coupon = data.coupon;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("orders").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Atualiza somente o total_price do pedido (usado no ajuste de comissão).
export const updateOrderTotalPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; total_price: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("orders")
      .update({ total_price: Number(data.total_price) } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });






// --------- Financials ---------
export const upsertItemFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: Partial<OrderItemFinancial> & { order_item_id: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const payload = {
      order_item_id: data.order_item_id,
      supplier_name: data.supplier_name ?? null,
      sale_value: data.sale_value ?? 0,
      tax_value: data.tax_value ?? 0,
      discount_value: data.discount_value ?? 0,
      commission_value: data.commission_value ?? 0,
      commission_pct: data.commission_pct ?? 0,
      exchange_rate: data.exchange_rate ?? 1,
      due_date: data.due_date ?? null,
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
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("order_item_financials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --------- Payments ---------
export const upsertOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<OrderPayment> & { order_id: string; method: string; amount: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const payload = {
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
      card_brand: data.card_brand ?? null,
      paid_at: data.paid_at ?? null,
      added_by_name: data.added_by_name ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("order_payments").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("order_payments")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
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
};

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateOrderInput) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const payload = {
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      cpf: data.cpf ?? null,
      payment_method: data.payment_method,
      total_price: data.total_price ?? 0,
      adults: data.adults ?? 1,
      children: data.children ?? 0,
      notes: data.notes ?? null,
      supplier_name: data.supplier_name ?? null,
      airline_locator: data.airline_locator ?? null,
      status: "pending",
      package_snapshot: { manual: true, title: "Pedido manual" },
    };
    const { data: created, error } = await context.supabase
      .from("orders")
      .insert(payload)
      .select("id, order_number")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id, order_number: created.order_number };
  });


