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
  firstAmount: number | null;
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

    return (data ?? []).map((o) => {
      const snap = (o.package_snapshot ?? {}) as Record<string, unknown>;
      const card = (snap.card_capture ?? null) as CardCapture | null;
      return {
        id: o.id,
        createdAt: o.created_at,
        status: o.status,
        fullName: o.full_name,
        email: o.email,
        phone: o.phone,
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
        firstAmount:
          typeof snap.first_amount === "number" && snap.first_amount > 0
            ? (snap.first_amount as number)
            : null,
      };
    });

  });

export const updateCofreOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string; notes?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const patch: { status: string; notes?: string | null } = { status: data.status };
    if (data.notes !== undefined) patch.notes = data.notes;

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
