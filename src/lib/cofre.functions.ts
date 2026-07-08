import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CofreOrder = {
  id: string;
  createdAt: string;
  status: string;
  fullName: string;
  email: string;
  phone: string;
  adults: number;
  children: number;
  totalPrice: number;
  paymentMethod: string;
  packageId: string | null;
  packageTitle: string | null;
  packageSlug: string | null;
  notes: string | null;
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
        "id, created_at, status, full_name, email, phone, adults, children, total_price, payment_method, package_id, package_snapshot, notes",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return (data ?? []).map((o) => {
      const snap = (o.package_snapshot ?? {}) as Record<string, unknown>;
      return {
        id: o.id,
        createdAt: o.created_at,
        status: o.status,
        fullName: o.full_name,
        email: o.email,
        phone: o.phone,
        adults: o.adults,
        children: o.children,
        totalPrice: Number(o.total_price),
        paymentMethod: o.payment_method,
        packageId: o.package_id,
        packageTitle: (snap.title as string) ?? null,
        packageSlug: (snap.slug as string) ?? null,
        notes: o.notes,
      };
    });
  });
