/**
 * Entrega o cartão de embarque para o cliente via WhatsApp.
 * Envia um cartão para cada passageiro, no WhatsApp cadastrado nele.
 * Não envia e-mail.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppDocument } from "@/lib/whatsapp/send.server";

function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export async function deliverBoardingPass(checkinId: string): Promise<void> {
  const { data: ci } = await supabaseAdmin
    .from("flight_checkins")
    .select("id, order_id, order_item_id, passenger_id, flight_number, boarding_pass_path, boarding_pass_url")
    .eq("id", checkinId)
    .maybeSingle();
  if (!ci) return;

  // URL pública servida pelo próprio domínio (evita ad-blockers em links do storage).
  const base = process.env.SITE_URL || "https://pedidos.viaair.tur.br";
  const url = `${base}/api/public/boarding-pass/${ci.id}`;
  const flightNum = ci.flight_number ?? "";

  // Descobre os passageiros do check-in.
  // 1) Se o check-in aponta pra um passageiro específico, é só ele.
  // 2) Caso contrário, pega os passageiros vinculados ao item de voo.
  // 3) Fallback: todos do pedido.
  let passengers: Array<{ id: string; full_name: string | null; whatsapp: string | null }> = [];
  if (ci.passenger_id) {
    const { data } = await supabaseAdmin
      .from("order_passengers")
      .select("id, full_name, whatsapp")
      .eq("id", ci.passenger_id);
    passengers = data ?? [];
  } else if (ci.order_item_id) {
    const { data: links } = await supabaseAdmin
      .from("order_item_passengers")
      .select("passenger_id")
      .eq("order_item_id", ci.order_item_id);
    const ids = (links ?? []).map((l: any) => l.passenger_id).filter(Boolean);
    if (ids.length) {
      const { data } = await supabaseAdmin
        .from("order_passengers")
        .select("id, full_name, whatsapp")
        .in("id", ids);
      passengers = data ?? [];
    }
  }
  if (passengers.length === 0) {
    const { data } = await supabaseAdmin
      .from("order_passengers")
      .select("id, full_name, whatsapp")
      .eq("order_id", ci.order_id);
    passengers = data ?? [];
  }

  let anyDelivered = false;
  for (const pax of passengers) {
    const phone = normalizePhone(pax.whatsapp);
    if (!phone) {
      console.warn(`[checkin] passageiro sem WhatsApp: ${pax.full_name ?? pax.id}`);
      continue;
    }
    const first = (pax.full_name ?? "").split(/\s+/)[0] || "";
    const caption = `✈️ *Cartão de embarque LATAM* ${flightNum}\n\nOlá, ${first}! Fizemos seu check-in. Aqui está seu cartão de embarque em PDF. Bom voo! 💛`;
    try {
      const r = await sendWhatsAppDocument(phone, url, `cartao-embarque-${flightNum || pax.id.slice(0, 6)}.pdf`, caption);
      if (r.id) anyDelivered = true;
      else console.error(`[checkin] wa send falhou p/ ${pax.full_name}:`, r.error);
    } catch (e) {
      console.error("[checkin] wa send exception", e);
    }
  }

  if (anyDelivered) {
    await supabaseAdmin
      .from("flight_checkins")
      .update({ delivered_wa_at: new Date().toISOString() })
      .eq("id", checkinId);
  }
}
