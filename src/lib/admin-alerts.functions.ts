import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão");
}

export const listFlightAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("flight_change_alerts")
      .select(
        "id, order_id, order_item_id, flight_number, old_depart_at, new_depart_at, new_status, severity, summary, admin_seen_at, admin_email_sent_at, response, responded_at, wa_phone, created_at, orders!inner(order_number, full_name, payer_full_name)",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((r: any) => ({
      id: r.id as string,
      orderId: r.order_id as string,
      orderNumber: (r.orders?.order_number ?? "") as string,
      customerName: (r.orders?.full_name ?? r.orders?.payer_full_name ?? "Cliente") as string,
      flightNumber: r.flight_number as string,
      severity: (r.severity ?? "info") as string,
      summary: (r.summary ?? `Voo ${r.flight_number}`) as string,
      oldDepartAt: r.old_depart_at as string | null,
      newDepartAt: r.new_depart_at as string | null,
      newStatus: r.new_status as string | null,
      response: r.response as string | null,
      respondedAt: r.responded_at as string | null,
      seenAt: r.admin_seen_at as string | null,
      emailSentAt: r.admin_email_sent_at as string | null,
      createdAt: r.created_at as string,
    }));
    const unseen = rows.filter((r) => !r.seenAt).length;
    return { rows, unseen };
  });

export const markFlightAlertSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("flight_change_alerts")
      .update({ admin_seen_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllFlightAlertsSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("flight_change_alerts")
      .update({ admin_seen_at: new Date().toISOString() })
      .is("admin_seen_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
