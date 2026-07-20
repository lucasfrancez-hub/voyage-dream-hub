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
    .select("id, order_id, order_item_id, passenger_id, flight_number, locator, departure_at, boarding_pass_path, boarding_pass_url, boarding_passes")
    .eq("id", checkinId)
    .maybeSingle();
  if (!ci) return report;

  // Monta lista de cartões (novo formato boarding_passes[] preferido; fallback pro único legado).
  type PassRec = { path: string; url: string | null; passenger_index: number; bytes: Uint8Array; isImage: boolean; ext: "png" | "jpg" | "pdf" };
  const rawPasses: Array<{ path: string; url: string | null; passenger_index: number }> = Array.isArray(ci.boarding_passes) && (ci.boarding_passes as unknown[]).length > 0
    ? (ci.boarding_passes as Array<{ path: string; url: string | null; passenger_index?: number }>).map((p, i) => ({
        path: p.path,
        url: p.url ?? null,
        passenger_index: typeof p.passenger_index === "number" && p.passenger_index > 0 ? p.passenger_index : i + 1,
      }))
    : ci.boarding_pass_path
      ? [{ path: ci.boarding_pass_path, url: ci.boarding_pass_url ?? null, passenger_index: 1 }]
      : [];

  if (rawPasses.length === 0) {
    report.failed.push({ name: "—", error: "Arquivo do cartão não encontrado. Rode o check-in novamente." });
    return report;
  }

  const passes: PassRec[] = [];
  for (const p of rawPasses) {
    const downloaded = await supabaseAdmin.storage.from("boarding-passes").download(p.path);
    if (downloaded.error || !downloaded.data) {
      const error = `Arquivo do cartão não encontrado (${p.path}). Rode o check-in novamente.`;
      await supabaseAdmin.from("flight_checkins")
        .update({ status: "failed", error })
        .eq("id", checkinId);
      report.failed.push({ name: "—", error });
      return report;
    }
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const signed = await supabaseAdmin.storage.from("boarding-passes").createSignedUrl(p.path, 60 * 60 * 24);
    const isPng = bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    passes.push({
      path: p.path,
      url: signed.data?.signedUrl ?? p.url,
      passenger_index: p.passenger_index,
      bytes,
      isImage: isPng || isJpg,
      ext: isPng ? "png" : isJpg ? "jpg" : "pdf",
    });
  }

  const flightNum = ci.flight_number ?? "";
  const locator = ci.locator ?? "";

  // Busca destino / cidade a partir do order_item.
  // Se a reserva tem conexões (mesmo locator, múltiplos trechos), usa o destino
  // do ÚLTIMO trecho (destino final da viagem) — ex.: GRU→PTY→CUR → mostra CUR.
  let destino = "";
  if (ci.order_item_id) {
    // Busca o item ancorado e, se houver locator, todos os irmãos do mesmo locator no pedido
    const { data: anchor } = await supabaseAdmin
      .from("order_items")
      .select("id, order_id, details, supplier_locator")
      .eq("id", ci.order_item_id)
      .maybeSingle();
    let finalDetails: Record<string, any> = (anchor?.details ?? {}) as Record<string, any>;
    const anchorLocator = String(
      (anchor as any)?.supplier_locator ||
      finalDetails.carrier_locator ||
      finalDetails.locator ||
      ci.locator || "",
    ).trim().toUpperCase();
    if (anchor?.order_id && anchorLocator) {
      const { data: siblings } = await supabaseAdmin
        .from("order_items")
        .select("id, details, supplier_locator")
        .eq("order_id", anchor.order_id)
        .eq("kind", "flight");
      const chain = (siblings ?? [])
        .filter((s: any) => {
          const loc = String(
            s.supplier_locator || s.details?.carrier_locator || s.details?.locator || "",
          ).trim().toUpperCase();
          return loc === anchorLocator;
        })
        .sort((a: any, b: any) => {
          const da = new Date(a.details?.depart_at || a.details?.departure_at || 0).getTime();
          const db = new Date(b.details?.depart_at || b.details?.departure_at || 0).getTime();
          return da - db;
        });
      if (chain.length > 0) finalDetails = chain[chain.length - 1].details ?? finalDetails;
    }
    const d = finalDetails;
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

  // Sempre buscamos TODOS os passageiros do pedido ordenados por sort_order —
  // o passenger_index dos cartões (1-based) casa com essa ordem.
  let passengers: Array<{ id: string; full_name: string | null; whatsapp: string | null }> = [];
  {
    const { data } = await supabaseAdmin
      .from("order_passengers")
      .select("id, full_name, whatsapp, sort_order")
      .eq("order_id", ci.order_id)
      .order("sort_order", { ascending: true });
    passengers = (data ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name, whatsapp: p.whatsapp }));
  }
  // Se o cartão está atrelado a um order_item específico, restringimos aos pax daquele item.
  if (ci.order_item_id) {
    const { data: links } = await supabaseAdmin
      .from("order_item_passengers")
      .select("passenger_id")
      .eq("order_item_id", ci.order_item_id);
    const ids = new Set((links ?? []).map((l: any) => l.passenger_id).filter(Boolean));
    if (ids.size > 0) passengers = passengers.filter((p) => ids.has(p.id));
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

  for (let i = 0; i < passengers.length; i += 1) {
    const pax = passengers[i];
    const paxOrdinal = i + 1; // 1-based, alinhado com passenger_index
    const phone = normalizePhone(pax.whatsapp);
    const label = pax.full_name ?? pax.id;
    if (!phone) {
      report.skippedNoPhone.push({ name: label });
      console.warn(`[checkin] passageiro sem WhatsApp: ${label}`);
      continue;
    }
    // Escolhe o cartão específico deste pax; se só existe um (voo simples/legado),
    // usamos o mesmo pra todos. Caso contrário, tenta casar pelo passenger_index.
    let pass = passes.find((p) => p.passenger_index === paxOrdinal);
    if (!pass && passes.length === 1) pass = passes[0];
    if (!pass) {
      report.failed.push({ name: label, error: `Sem cartão capturado pro passageiro ${paxOrdinal}. Recapture no treinador.` });
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
    const filename = `cartao-embarque-${flightNum || pax.id.slice(0, 6)}-pax${paxOrdinal}.${pass.ext}`;
    try {
      const r = pass.isImage
        ? await sendWhatsAppImageBytes(phone, pass.bytes, filename, caption, pass.url || undefined)
        : await sendWhatsAppDocumentBytes(phone, pass.bytes, filename, caption, pass.url || undefined);
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
