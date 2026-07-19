/**
 * Entrega o cartão de embarque para o cliente via WhatsApp.
 * Envia um cartão para cada passageiro, no WhatsApp cadastrado nele.
 * Fallback: telefone celular do pedido, se nenhum passageiro tiver WhatsApp.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppDocument } from "@/lib/whatsapp/send.server";

function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export type DeliverReport = {
  attempted: number;
  delivered: number;
  skippedNoPhone: Array<{ name: string }>;
  failed: Array<{ name: string; error: string }>;
  usedOrderFallback: boolean;
};

export async function deliverBoardingPass(checkinId: string): Promise<DeliverReport> {
  const report: DeliverReport = {
    attempted: 0,
    delivered: 0,
    skippedNoPhone: [],
    failed: [],
    usedOrderFallback: false,
  };
  const { data: ci } = await supabaseAdmin
    .from("flight_checkins")
    .select("id, order_id, order_item_id, passenger_id, flight_number, boarding_pass_path, boarding_pass_url")
    .eq("id", checkinId)
    .maybeSingle();
  if (!ci) return report;

  const base = "https://pedidos.viaair.tur.br";
  const url = `${base}/api/public/bp/${ci.id}`;
  const flightNum = ci.flight_number ?? "";

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

  // Fallback: se nenhum passageiro tem WhatsApp válido, usa o telefone do
  // pedido — somente se parecer celular (BR: 11 dígitos após DDD começando com 9).
  const anyHasPhone = passengers.some((p) => normalizePhone(p.whatsapp).length >= 10);
  if (!anyHasPhone) {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("phone, payer_phone, full_name")
      .eq("id", ci.order_id)
      .maybeSingle();
    const candidate = normalizePhone(order?.phone ?? order?.payer_phone ?? "");
    const digitsAfterDdi = candidate.startsWith("55") ? candidate.slice(2) : candidate;
    const isLikelyMobile = digitsAfterDdi.length === 11 && digitsAfterDdi[2] === "9";
    if (candidate && isLikelyMobile) {
      passengers = [{ id: ci.order_id, full_name: order?.full_name ?? null, whatsapp: candidate }];
      report.usedOrderFallback = true;
    }
  }

  for (const pax of passengers) {
    const phone = normalizePhone(pax.whatsapp);
    const label = pax.full_name ?? pax.id;
    if (!phone) {
      report.skippedNoPhone.push({ name: label });
      console.warn(`[checkin] passageiro sem WhatsApp: ${label}`);
      continue;
    }
    report.attempted++;
    const first = (pax.full_name ?? "").split(/\s+/)[0] || "";
    const caption = `✈️ *Cartão de embarque LATAM* ${flightNum}\n\nOlá, ${first}! Fizemos seu check-in. Aqui está seu cartão de embarque em PDF. Bom voo! 💛`;
    try {
      const r = await sendWhatsAppDocument(phone, url, `cartao-embarque-${flightNum || pax.id.slice(0, 6)}.pdf`, caption);
      if (r.id) {
        report.delivered++;
      } else {
        report.failed.push({ name: label, error: r.error ?? "erro desconhecido" });
        console.error(`[checkin] wa send falhou p/ ${label}:`, r.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.failed.push({ name: label, error: msg });
      console.error("[checkin] wa send exception", e);
    }
  }

  if (report.delivered > 0) {
    await supabaseAdmin
      .from("flight_checkins")
      .update({ delivered_wa_at: new Date().toISOString() })
      .eq("id", checkinId);
  }
  return report;
}
