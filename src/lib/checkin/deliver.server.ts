/**
 * Entrega o cartão de embarque para o cliente via WhatsApp.
 * Envia um cartão para cada passageiro, no WhatsApp cadastrado nele.
 * Fallback: telefone celular do pedido, se nenhum passageiro tiver WhatsApp.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { iataCity } from "@/lib/iata-lookup";
import { sendWhatsAppDocumentBytes, sendWhatsAppImageBytes } from "@/lib/whatsapp/send.server";

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
    .select("id, order_id, order_item_id, passenger_id, flight_number, locator, departure_at, boarding_pass_path, boarding_pass_url")
    .eq("id", checkinId)
    .maybeSingle();
  if (!ci) return report;

  // Carrega o PDF diretamente do storage. Além de evitar URLs assinadas no
  // envio à UazAPI, isso detecta registros antigos cujo arquivo foi apagado.
  let url = ci.boarding_pass_url ?? "";
  let fileBytes: Uint8Array | null = null;
  if (ci.boarding_pass_path) {
    const downloaded = await supabaseAdmin.storage
      .from("boarding-passes")
      .download(ci.boarding_pass_path);
    if (downloaded.error || !downloaded.data) {
      const error = "Arquivo do cartão não encontrado no armazenamento. Rode o check-in novamente.";
      await supabaseAdmin
        .from("flight_checkins")
        .update({ status: "failed", error, boarding_pass_path: null, boarding_pass_url: null })
        .eq("id", checkinId);
      report.failed.push({ name: "—", error });
      return report;
    }
    fileBytes = new Uint8Array(await downloaded.data.arrayBuffer());

    const signed = await supabaseAdmin.storage
      .from("boarding-passes")
      .createSignedUrl(ci.boarding_pass_path, 60 * 60 * 24);
    if (signed.data?.signedUrl) url = signed.data.signedUrl;
  }
  if (!fileBytes) {
    report.failed.push({ name: "—", error: "Arquivo do cartão não encontrado. Rode o check-in novamente." });
    return report;
  }
  // Detecta PNG (89 50 4E 47) — capturado do treinador — vs PDF (25 50 44 46).
  const isPng = fileBytes.length >= 4 && fileBytes[0] === 0x89 && fileBytes[1] === 0x50 && fileBytes[2] === 0x4e && fileBytes[3] === 0x47;
  const isJpg = fileBytes.length >= 3 && fileBytes[0] === 0xff && fileBytes[1] === 0xd8 && fileBytes[2] === 0xff;
  const isImage = isPng || isJpg;
  const ext = isPng ? "png" : isJpg ? "jpg" : "pdf";
  const flightNum = ci.flight_number ?? "";
  const locator = ci.locator ?? "";

  // Busca destino / cidade a partir do order_item (details.to_city / to_iata).
  let destino = "";
  if (ci.order_item_id) {
    const { data: it } = await supabaseAdmin
      .from("order_items")
      .select("details")
      .eq("id", ci.order_item_id)
      .maybeSingle();
    const d = (it?.details ?? {}) as Record<string, any>;
    const genericDestination = String(d.to || d.destination || "").trim();
    const iata = String(
      d.to_iata ||
      d.arrival_iata ||
      (/^[A-Za-z]{3}$/.test(genericDestination) ? genericDestination : ""),
    ).trim().toUpperCase();
    let rawCity = String(d.to_city || d.destination_city || "").trim();
    if (!rawCity && genericDestination.toUpperCase() !== iata) rawCity = genericDestination;
    const airport = String(d.to_airport || "").trim();
    if (airport && rawCity) {
      const re = new RegExp(`\\b${airport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig");
      rawCity = rawCity.replace(re, "").replace(/\s+/g, " ").trim();
    }
    // Importações antigas podem trazer somente o IATA ou esvaziar a cidade
    // ao remover o nome do aeroporto. Nesses casos, resolve a cidade pelo IATA.
    if (!rawCity || rawCity.toUpperCase() === iata) rawCity = iataCity(iata) ?? rawCity;
    const small = new Set(["de", "da", "do", "das", "dos", "e"]);
    const city = rawCity
      .toLocaleLowerCase("pt-BR")
      .split(/\s+/)
      .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
      .join(" ");
    destino = [city, iata ? `(${iata})` : ""].filter(Boolean).join(" ");
  }



  // Formata data/horário do voo em pt-BR.
  let dataVoo = "";
  let horaVoo = "";
  if (ci.departure_at) {
    // O horário do voo é armazenado como wall-clock local do aeroporto (sem
    // conversão de fuso). Formatamos em UTC para preservar exatamente os
    // dígitos originais (ex.: 12:15 permanece 12:15, não vira 09:15).
    const dt = new Date(ci.departure_at);
    if (!isNaN(dt.getTime())) {
      dataVoo = dt.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
      horaVoo = dt.toLocaleTimeString("pt-BR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
    }
  }

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
    const nomeCliente = first || (pax.full_name ?? "");
    const caption =
      `Olá, *${nomeCliente}!* ✈️\n\n` +
      `Boas notícias! Seu check-in já foi realizado com sucesso.\n\n` +
      `Você não precisa fazer mais nada. Basta se apresentar ao aeroporto no horário recomendado para embarcar.\n\n` +
      `Segue seu cartão de embarque para a sua viagem:\n\n` +
      `*Destino*: ${destino || "—"}\n` +
      `*Data*: ${dataVoo || "—"}\n` +
      `*Voo*: ${flightNum || "—"}\n` +
      `*Horário*: ${horaVoo || "—"}\n` +
      `*Localizador*: ${locator || "—"}\n\n` +
      `📎 Seu cartão de embarque está anexado a esta mensagem.\n\n` +
      `_*Esta é uma mensagem automática. Em caso de dúvidas, basta responder esta mensagem e um dos nossos atendentes irá atendê-lo(a) o mais breve possível.*_\n\n` +
      `Desejamos uma excelente viagem! 💙\n\n` +
      `_Equipe Via Air_`;
    const filename = `cartao-embarque-${flightNum || pax.id.slice(0, 6)}.${ext}`;
    try {
      const r = isImage
        ? await sendWhatsAppImageBytes(phone, fileBytes, filename, caption, url || undefined)
        : await sendWhatsAppDocumentBytes(phone, fileBytes, filename, caption, url || undefined);
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
