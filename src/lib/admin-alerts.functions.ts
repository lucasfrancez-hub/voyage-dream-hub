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
        "id, order_id, order_item_id, flight_number, old_depart_at, new_depart_at, old_arrive_at, new_arrive_at, new_status, severity, summary, admin_seen_at, admin_email_sent_at, response, responded_at, wa_phone, wa_button_message_id, created_at, orders!inner(order_number, full_name, payer_full_name, airline_locator), order_items(supplier_locator)",
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
      locator: (r.order_items?.supplier_locator ?? r.orders?.airline_locator ?? null) as string | null,
      severity: (r.severity ?? "info") as string,
      summary: (r.summary ?? `Voo ${r.flight_number}`) as string,
      oldDepartAt: r.old_depart_at as string | null,
      newDepartAt: r.new_depart_at as string | null,
      oldArriveAt: r.old_arrive_at as string | null,
      newArriveAt: r.new_arrive_at as string | null,
      newStatus: r.new_status as string | null,
      response: r.response as string | null,
      respondedAt: r.responded_at as string | null,
      seenAt: r.admin_seen_at as string | null,
      emailSentAt: r.admin_email_sent_at as string | null,
      waPhone: (r.wa_phone ?? null) as string | null,
      autoSent: !!r.wa_button_message_id,
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

export const sendFlightAlertToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, message: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: alert, error } = await supabaseAdmin
      .from("flight_change_alerts")
      .select("id, order_id, orders!inner(phone, payer_phone)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const orderId = (alert as any)?.order_id;

    // Sempre priorizar o WhatsApp do passageiro principal (primeiro pax do pedido)
    let phone: string | null = null;
    if (orderId) {
      const { data: pax } = await supabaseAdmin
        .from("order_passengers")
        .select("whatsapp, sort_order, created_at")
        .eq("order_id", orderId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (pax?.whatsapp) phone = pax.whatsapp as string;
    }
    if (!phone) phone = (alert as any)?.orders?.phone || (alert as any)?.orders?.payer_phone || null;

    if (!phone) throw new Error("Passageiro principal sem WhatsApp cadastrado");
    const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
    const sent = await sendWhatsAppText(phone, data.message);
    if (sent.error) throw new Error(sent.error);
    return { ok: true, id: sent.id };
  });

