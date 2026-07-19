/**
 * Entrega o cartão de embarque para o cliente via WhatsApp + e-mail.
 * Chamado após o check-in ser bem-sucedido.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppDocument } from "@/lib/whatsapp/send.server";

export async function deliverBoardingPass(checkinId: string): Promise<void> {
  const { data: ci } = await supabaseAdmin
    .from("flight_checkins")
    .select("*, orders!inner(full_name, email, whatsapp, order_number)")
    .eq("id", checkinId)
    .maybeSingle();
  if (!ci) return;
  const order = (ci as any).orders as { full_name?: string; email?: string; whatsapp?: string; order_number?: string };
  const url = (ci as any).boarding_pass_url as string | null;
  if (!url) return;

  const first = (order.full_name ?? "").split(/\s+/)[0] || "";
  const flightNum = (ci as any).flight_number ?? "";
  const caption = `✈️ *Cartão de embarque LATAM* ${flightNum}\n\nOlá, ${first}! Fizemos seu check-in. Aqui está seu cartão de embarque em PDF. Bom voo! 💛`;

  // WhatsApp
  if (order.whatsapp) {
    try {
      const r = await sendWhatsAppDocument(order.whatsapp, url, `cartao-embarque-${flightNum}.pdf`, caption);
      if (r.id) {
        await supabaseAdmin.from("flight_checkins").update({ delivered_wa_at: new Date().toISOString() }).eq("id", checkinId);
      }
    } catch (e) {
      console.error("[checkin] wa send failed", e);
    }
  }

  // E-mail
  if (order.email) {
    try {
      const emailPayload = {
        templateName: "cartao-embarque",
        recipientEmail: order.email,
        idempotencyKey: `checkin-${checkinId}`,
        templateData: {
          name: first,
          flightNumber: flightNum,
          boardingPassUrl: url,
          orderNumber: order.order_number ?? "",
        },
      };
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const base = process.env.SITE_URL || "https://pedidos.viaair.tur.br";
      await fetch(`${base}/lovable/email/transactional/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(emailPayload),
      });
      await supabaseAdmin.from("flight_checkins").update({ delivered_email_at: new Date().toISOString() }).eq("id", checkinId);
    } catch (e) {
      console.error("[checkin] email send failed", e);
    }
  }
}
