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
};

export type OrderItem = {
  id: string;
  order_id: string;
  kind: "hotel" | "flight" | "other";
  status: "confirmed" | "cancelled" | "pending";
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
  supplierName: string | null;
  supplierOrderNumber: string | null;
  airlineLocator: string | null;
  packageSnapshot: Record<string, unknown>;
};

export type OrderDetail = {
  order: OrderHeader;
  passengers: OrderPassenger[];
  items: OrderItem[];
  financials: OrderItemFinancial[];
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

    return {
      order: {
        id: order.id,
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
        supplierName: order.supplier_name ?? null,
        supplierOrderNumber: order.supplier_order_number ?? null,
        airlineLocator: order.airline_locator ?? null,
        packageSnapshot: (order.package_snapshot ?? {}) as Record<string, unknown>,
      },
      passengers: (passengers ?? []) as OrderPassenger[],
      items: (items ?? []).map((i) => ({
        id: i.id,
        order_id: i.order_id,
        kind: i.kind as OrderItem["kind"],
        status: i.status as OrderItem["status"],
        title: i.title,
        supplier_locator: i.supplier_locator,
        details: (i.details ?? {}) as Record<string, unknown>,
        sort_order: i.sort_order,
      })),
      financials,
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
      discount_value: data.discount_value ?? 0,
      commission_value: data.commission_value ?? 0,
      commission_pct: data.commission_pct ?? 0,
      exchange_rate: data.exchange_rate ?? 1,
      due_date: data.due_date ?? null,
      total: data.total ?? 0,
      notes: data.notes ?? null,
      sort_order: data.sort_order ?? 0,
    };
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

// unused reference to keep TS import
void ensureAdmin;
