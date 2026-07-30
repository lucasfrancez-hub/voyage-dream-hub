import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CardCapture = {
  brand_hint?: string;
  last4?: string;
  holder?: string;
  expiry?: string;
  cvv?: string;
  full_number?: string;
  billing?: {
    address?: string;
    number?: string;
    zip?: string;
    city?: string;
    state?: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authorization?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  liveness?: Record<string, any> | null;
};

export type BoletoCapture = Record<string, string | null>;

export type SnapshotPassenger = {
  index?: number;
  full_name?: string;
  cpf?: string | null;
  birth_date?: string | null;
  email?: string;
  phone?: string;
  whatsapp?: string | null;
  passenger_type?: string | null;
  kind?: string | null;
  document?: string | null;
  doc_type?: string | null;
  passport_number?: string | null;
  ticket_number?: string | null;
};


export type CofreOrder = {
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
  packageId: string | null;
  packageTitle: string | null;
  packageSlug: string | null;
  notes: string | null;
  cardCapture: CardCapture | null;
  linkDescription: string | null;
  linkReference: string | null;
  orderNumber: string | null;
  firstAmount: number | null;
  snapshotKind: string | null;
  isManual: boolean;
  boletoCapture: BoletoCapture | null;
  passengers: SnapshotPassenger[];

};



export const listCofreOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CofreOrder[]> => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, status, full_name, email, phone, cpf, birth_date, adults, children, total_price, payment_method, package_id, package_snapshot, notes",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const orderIds = (data ?? []).map((o) => o.id);
    const passengerRowsByOrder: Record<string, SnapshotPassenger[]> = {};
    if (orderIds.length > 0) {
      const { data: passengerRows, error: passengerErr } = await supabase
        .from("order_passengers")
        .select("order_id, full_name, cpf, birth_date, whatsapp, passenger_type, document, doc_type, passport_number, ticket_number, sort_order")
        .in("order_id", orderIds)
        .order("sort_order", { ascending: true });
      if (passengerErr) throw new Error(passengerErr.message);

      (passengerRows ?? []).forEach((p) => {
        const orderId = p.order_id;
        if (!passengerRowsByOrder[orderId]) passengerRowsByOrder[orderId] = [];
        const passengerGroup = passengerRowsByOrder[orderId];
        passengerGroup.push({
          index: typeof p.sort_order === "number" ? p.sort_order + 1 : passengerGroup.length + 1,
          full_name: p.full_name,
          cpf: p.cpf,
          birth_date: p.birth_date,
          phone: p.whatsapp ?? undefined,
          whatsapp: p.whatsapp,
          passenger_type: p.passenger_type,
          document: p.document,
          doc_type: p.doc_type,
          passport_number: p.passport_number,
          ticket_number: p.ticket_number,
        });
      });
    }

    return (data ?? []).map((o) => {
      const snap = (o.package_snapshot ?? {}) as Record<string, unknown>;
      const card = (snap.card_capture ?? null) as CardCapture | null;
      const snapshotPassengerSource = Array.isArray(snap.passengers)
        ? snap.passengers
        : Array.isArray(snap.travelers)
          ? snap.travelers
          : [];
      const snapshotPassengers: SnapshotPassenger[] = snapshotPassengerSource.map((raw, i) => {
        const p = (raw ?? {}) as Record<string, unknown>;
        const text = (key: string) => (typeof p[key] === "string" ? (p[key] as string) : null);
        return {
          index: typeof p.index === "number" ? p.index : i + 1,
          full_name: text("full_name") ?? text("name") ?? `Passageiro ${i + 1}`,
          cpf: text("cpf"),
          birth_date: text("birth_date"),
          email: text("email") ?? undefined,
          phone: text("phone") ?? text("whatsapp") ?? undefined,
          whatsapp: text("whatsapp"),
          passenger_type: text("passenger_type"),
          kind: text("kind"),
          document: text("document"),
          doc_type: text("doc_type"),
          passport_number: text("passport_number"),
          ticket_number: text("ticket_number"),
        };
      });
      const materializedPassengers = passengerRowsByOrder[o.id] ?? [];
      const passengers = materializedPassengers.length > 0
        ? materializedPassengers.map((p, i) => ({
            ...p,
            email: p.email ?? snapshotPassengers[i]?.email,
            phone: p.phone ?? snapshotPassengers[i]?.phone,
            cpf: p.cpf ?? snapshotPassengers[i]?.cpf ?? null,
            birth_date: p.birth_date ?? snapshotPassengers[i]?.birth_date ?? null,
          }))
        : snapshotPassengers;
      const rawBoletoSource = snap.boleto_capture ?? snap.boletoCapture ?? snap.financier ?? null;
      const rawBoleto = rawBoletoSource && typeof rawBoletoSource === "object" && !Array.isArray(rawBoletoSource)
        ? (rawBoletoSource as Record<string, unknown>)
        : null;
      const boletoCapture = rawBoleto
        ? Object.fromEntries(
            Object.entries(rawBoleto).map(([key, value]) => [
              key,
              value == null ? null : String(value),
            ]),
          ) as BoletoCapture
        : null;
      return {
        id: o.id,
        createdAt: o.created_at,
        status: o.status,
        fullName: o.full_name ?? "",
        email: o.email ?? "",
        phone: o.phone ?? "",
        cpf: o.cpf ?? null,
        birthDate: o.birth_date ?? null,
        adults: o.adults,
        children: o.children,
        totalPrice: Number(o.total_price),
        paymentMethod: o.payment_method,
        packageId: o.package_id,
        packageTitle: (snap.title as string) ?? null,
        packageSlug: (snap.slug as string) ?? null,
        notes: o.notes,
        cardCapture: card,
        linkDescription: (snap.description as string) ?? null,
        linkReference: (snap.reference as string) ?? null,
        orderNumber: (snap.order_number as string) ?? null,
        firstAmount:
          typeof snap.first_amount === "number" && snap.first_amount > 0
            ? (snap.first_amount as number)
            : null,
        snapshotKind: (snap.kind as string) ?? null,
        isManual: snap.manual === true,
        boletoCapture,
        passengers,

      };

    });

  });

export const updateCofreOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    status?: string;
    notes?: string | null;
    supplier_name?: string | null;
    supplier_order_number?: string | null;
    airline_locator?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const patch: {
      status?: string;
      notes?: string | null;
      supplier_name?: string | null;
      supplier_order_number?: string | null;
      airline_locator?: string | null;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.supplier_name !== undefined) patch.supplier_name = data.supplier_name;
    if (data.supplier_order_number !== undefined) patch.supplier_order_number = data.supplier_order_number;
    if (data.airline_locator !== undefined) patch.airline_locator = data.airline_locator;

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase.from("orders").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCofreOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { error } = await supabase.from("orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBoletoDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("boleto-documents")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
