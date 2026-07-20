import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Detecta cia aérea a partir do texto do voo/segmento.
 */
export function detectAirline(input: {
  airline?: string | null;
  flight_number?: string | null;
}): "LATAM" | "GOL" | "AZUL" | null {
  const a = (input.airline || "").toLowerCase();
  const fn = (input.flight_number || "").toUpperCase().trim();
  if (a.includes("latam") || fn.startsWith("LA") || fn.startsWith("JJ")) return "LATAM";
  if (a.includes("gol") || fn.startsWith("G3")) return "GOL";
  if (a.includes("azul") || fn.startsWith("AD")) return "AZUL";
  return null;
}

/**
 * Lista status dos check-ins de um pedido.
 */
export const listCheckins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("flight_checkins")
      .select("*")
      .eq("order_id", data.orderId)
      .order("departure_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Lista todos os check-ins (visão global — admin/staff).
 * Retorna com dados do pedido para exibir na página /admin/checkins.
 */
export const listAllCheckins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("flight_checkins")
      .select("*, order:orders(id, order_number, full_name), item:order_items(details), passenger:order_passengers(id, full_name)")
      .order("departure_at", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Lista voos LATAM futuros dos pedidos que ainda NÃO têm registro em
 * flight_checkins (ou seja, fora da janela do robô). Serve para mostrar
 * na mini-dashboard os próximos check-ins a serem realizados.
 */
export const listUpcomingFlights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const nowIso = new Date().toISOString();
    const in30d = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data: items } = await sb
      .from("order_items")
      .select("id, order_id, details, supplier_locator, order:orders(id, order_number, full_name, deleted_at)")
      .eq("kind", "flight")
      .or(`and(details->>depart_at.gte.${nowIso},details->>depart_at.lte.${in30d}),and(details->>departure_at.gte.${nowIso},details->>departure_at.lte.${in30d})`)
      .limit(500);
    const { data: existing } = await sb
      .from("flight_checkins")
      .select("order_item_id")
      .not("order_item_id", "is", null);
    const done = new Set((existing ?? []).map((r: any) => r.order_item_id));
    const rows = (items ?? [])
      .filter((it: any) => !it.order?.deleted_at)
      .filter((it: any) => !done.has(it.id))
      .filter((it: any) => detectAirline({ airline: it.details?.airline, flight_number: it.details?.flight_number }) === "LATAM")
      .map((it: any) => ({
        id: it.id,
        order: it.order,
        cia: "LATAM",
        locator: it.supplier_locator ?? it.details?.carrier_locator ?? it.details?.locator ?? null,
        flight_number: it.details?.flight_number ?? null,
        departure_at: it.details?.depart_at ?? it.details?.departure_at ?? null,
        origin: it.details?.from_iata ?? it.details?.origin ?? null,
        destination: it.details?.to_iata ?? it.details?.destination ?? null,
      }))
      .sort((a: any, b: any) => new Date(a.departure_at || 0).getTime() - new Date(b.departure_at || 0).getTime());
    return rows;
  });

/**
 * Reenvia o cartão de embarque para o(s) WhatsApp(s) dos passageiros.
 */
export const resendBoardingPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { checkinId: string }) => data)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { userId } = context as { userId: string };
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isStaff } = await sb.rpc("has_role", { _user_id: userId, _role: "user" });
    if (!isAdmin && !isStaff) throw new Error("Sem permissão");
    const { deliverBoardingPass } = await import("./deliver.server");
    const report = await deliverBoardingPass(data.checkinId);
    return { ok: true, report } as const;
  });

/**
 * Apaga o PDF atual do storage e roda o check-in de novo (para regenerar
 * cartões que ficaram em branco ou desatualizados).
 */
export const regenerateBoardingPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { checkinId: string }) => data)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { userId } = context as { userId: string };
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isStaff } = await sb.rpc("has_role", { _user_id: userId, _role: "user" });
    if (!isAdmin && !isStaff) throw new Error("Sem permissão");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // NÃO apaga o PDF atual: mantém o link `/api/public/bp/{id}` válido
    // servindo o cartão antigo até o robô capturar um novo. Se a nova
    // captura der certo, o runner sobrescreve o arquivo; se falhar, o
    // link continua funcionando com o cartão anterior.
    await supabaseAdmin
      .from("flight_checkins")
      .update({
        status: "pending" as any,
        delivered_wa_at: null as any,
        last_error: null as any,
      } as any)
      .eq("id", data.checkinId);
    return { ok: true };
  });

/**
 * Marca todos os check-ins com status success como pendentes para
 * reprocessar em lote. Preserva os PDFs atuais (o link `/api/public/bp/{id}`
 * continua servindo o cartão antigo até o robô salvar um novo).
 */
export const regenerateAllBoardingPasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { userId } = context as { userId: string };
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Sem permissão");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("flight_checkins")
      .select("id")
      .eq("status", "success");
    const ids = (rows ?? []).map((r: any) => r.id);
    if (ids.length) {
      await supabaseAdmin
        .from("flight_checkins")
        .update({
          status: "pending" as any,
          delivered_wa_at: null as any,
          last_error: null as any,
        } as any)
        .in("id", ids);
    }
    return { count: ids.length };
  });

/**
 * Roda o check-in agora (LATAM apenas por enquanto).
 * Aceita `checkinId` (para retry) OU `orderItemId` (cria/atualiza registro).
 */
export const runCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { checkinId?: string; orderItemId?: string; passengerId?: string | null; mode?: "code" | "vision" | "autopilot" }) => data)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { userId } = context as { userId: string };

    // Verifica role: apenas admin/staff.
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isStaff } = await sb.rpc("has_role", { _user_id: userId, _role: "user" });
    if (!isAdmin && !isStaff) throw new Error("Sem permissão");

    // Carrega ou cria o registro de check-in
    let checkin: any = null;
    let airlineCheckinUrl = "";
    if (data.checkinId) {
      const r = await sb.from("flight_checkins").select("*").eq("id", data.checkinId).maybeSingle();
      checkin = r.data;
      if (!checkin) throw new Error("Check-in não encontrado");
    } else if (data.orderItemId) {
      // Busca dados do item
      const it = await sb.from("order_items").select("id, order_id, kind, details, supplier_locator").eq("id", data.orderItemId).maybeSingle();
      const item = it.data as any;
      if (!item || item.kind !== "flight") throw new Error("Item não é um voo");
      const airline = detectAirline({ airline: item.details?.airline, flight_number: item.details?.flight_number });
      if (airline !== "LATAM") throw new Error("Fase 1 só suporta LATAM");
      const checkinUrl = (item.details?.airline_checkin_url || "").toString();
      airlineCheckinUrl = checkinUrl;
      let orderIdFromUrl = "";
      try {
        orderIdFromUrl = new URL(checkinUrl).searchParams.get("orderId")?.trim().toUpperCase() || "";
      } catch {
        orderIdFromUrl = checkinUrl.match(/[?&]orderId=([^&#]+)/i)?.[1]
          ? decodeURIComponent(checkinUrl.match(/[?&]orderId=([^&#]+)/i)![1]).trim().toUpperCase()
          : "";
      }
      const locator = (
        orderIdFromUrl ||
        item.details?.purchase_order ||
        item.details?.order_id ||
        item.supplier_locator ||
        item.details?.locator ||
        ""
      ).toString().trim().toUpperCase();
      if (!locator) throw new Error("Localizador ausente no voo");

      // Pega sobrenome do 1º passageiro do pedido
      const pax = await sb.from("order_passengers").select("id, full_name").eq("order_id", item.order_id).order("sort_order", { ascending: true }).limit(1);
      const firstPax = (pax.data as Array<any>)?.[0];
      const surname = firstPax?.full_name?.split(/\s+/).slice(-1)[0] ?? "";
      if (!surname) throw new Error("Sobrenome do passageiro não encontrado");

      const departureAt = item.details?.depart_at || item.details?.departure_at || null;

      const up = await sb
        .from("flight_checkins")
        .upsert({
          order_id: item.order_id,
          order_item_id: item.id,
          passenger_id: firstPax?.id ?? null,
          cia: airline,
          locator,
          pnr_surname: surname,
          flight_number: item.details?.flight_number ?? null,
          departure_at: departureAt,
          status: "running",
        }, { onConflict: "order_item_id,passenger_id" })
        .select("*")
        .single();
      checkin = up.data;
    } else {
      throw new Error("checkinId ou orderItemId obrigatório");
    }

    // Reservas LATAM podem guardar o PNR de 6 letras em `locator`, enquanto
    // o check-in automático exige o nº de compra LA957... presente no link
    // importado da companhia. Recalcula também nos retries já existentes.
    if (checkin.order_item_id) {
      const itemResult = await sb
        .from("order_items")
        .select("details, supplier_locator")
        .eq("id", checkin.order_item_id)
        .maybeSingle();
      const item = itemResult.data as any;
      const checkinUrl = (item?.details?.airline_checkin_url || "").toString();
      airlineCheckinUrl = checkinUrl;
      let latamOrderId = "";
      try {
        latamOrderId = new URL(checkinUrl).searchParams.get("orderId")?.trim().toUpperCase() || "";
      } catch {
        const match = checkinUrl.match(/[?&]orderId=([^&#]+)/i);
        latamOrderId = match?.[1] ? decodeURIComponent(match[1]).trim().toUpperCase() : "";
      }
      const resolvedLocator = (
        latamOrderId ||
        item?.details?.purchase_order ||
        item?.details?.order_id ||
        checkin.locator ||
        item?.supplier_locator ||
        ""
      ).toString().trim().toUpperCase();
      if (resolvedLocator && resolvedLocator !== checkin.locator) {
        await sb.from("flight_checkins").update({ locator: resolvedLocator }).eq("id", checkin.id);
        checkin = { ...checkin, locator: resolvedLocator };
      }
    }

    const mode = "autopilot" as const;

    // Marca running
    await sb.from("flight_checkins")
      .update({ status: "running", mode, last_attempt_at: new Date().toISOString(), attempts: (checkin.attempts ?? 0) + 1, error: null })
      .eq("id", checkin.id);

    const startedAt = Date.now();
    try {
      const { runLatamAutopilot } = await import("./latam-autopilot.server");
      const result: any = await runLatamAutopilot({ locator: checkin.locator, surname: checkin.pnr_surname, checkinUrl: airlineCheckinUrl });
      const visionCostCents: number | null = result.meta?.visionCostCents ?? null;

      // Upload no storage
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const path = `${checkin.order_id}/${checkin.id}.pdf`;
      const pdfBytes = Uint8Array.from(atob(result.boardingPassBase64), (c) => c.charCodeAt(0));
      const up = await supabaseAdmin.storage
        .from("boarding-passes")
        .upload(path, pdfBytes, { contentType: result.contentType, upsert: true });
      if (up.error) throw new Error(`Storage: ${up.error.message}`);

      // Signed URL 30 dias
      const signed = await supabaseAdmin.storage.from("boarding-passes").createSignedUrl(path, 60 * 60 * 24 * 30);
      const url = signed.data?.signedUrl ?? null;

      await sb.from("flight_checkins").update({
        status: "success",
        boarding_pass_path: path,
        boarding_pass_url: url,
        completed_at: new Date().toISOString(),
        run_duration_ms: Date.now() - startedAt,
        vision_cost_cents: visionCostCents,
      }).eq("id", checkin.id);

      // Dispara entrega em background (não bloqueia a resposta)
      try {
        const { deliverBoardingPass } = await import("./deliver.server");
        await deliverBoardingPass(checkin.id);
      } catch (e) {
        console.error("[checkin] delivery failed", e);
      }

      return { ok: true, id: checkin.id, url, mode, durationMs: Date.now() - startedAt } as const;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[checkin] LATAM automation failed", {
        checkinId: checkin.id,
        mode,
        error: msg.slice(0, 5_000),
      });

      const isNavigationBlock = /ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|ERR_CONNECTION_RESET/i.test(msg);
      const isIncompleteFlow = /Fluxo LATAM terminou antes do cartão|Robô visão não capturou/i.test(msg);
      const isProviderTimeout = /Browserless HTTP 408|Request has timed out|AbortError/i.test(msg);
      const isLatamBlock = /Tivemo.? um problema|não foi po.?ível carregar|nao foi possivel carregar/i.test(msg);
      const friendlyError = isLatamBlock
        ? "A LATAM interrompeu esta sessão. O robô fará uma nova tentativa automática."
        : isNavigationBlock || isProviderTimeout
          ? "A conexão com a LATAM não respondeu. O robô fará uma nova tentativa automática."
        : isIncompleteFlow
          ? "A sessão terminou antes do download. O robô fará uma nova tentativa automática."
          : "O check-in não terminou nesta sessão. O robô fará uma nova tentativa automática.";

      await sb.from("flight_checkins")
        .update({
          status: "failed",
          error: friendlyError,
          run_duration_ms: Date.now() - startedAt,
        })
        .eq("id", checkin.id);

      const surnameForUrl = (checkin.pnr_surname || "").toString().trim().toLowerCase();
      const orderIdForUrl = (checkin.locator || "").toString().trim().toUpperCase();
      const checkinStatusUrl = orderIdForUrl && surnameForUrl
        ? `https://www.latamairlines.com/br/pt/check-in/status?orderId=${encodeURIComponent(orderIdForUrl)}&lastName=${encodeURIComponent(surnameForUrl)}`
        : (airlineCheckinUrl || null);
      return { ok: false, id: checkin.id, error: friendlyError, manualUrl: checkinStatusUrl, mode } as const;
    }
  });

/**
 * Roda o check-in para todos os trechos de uma mesma reserva (mesmo PNR).
 * Executa o robô uma única vez e distribui os PDFs de cada abinha entre os
 * order_items correspondentes (matching por número do voo → fallback por ordem).
 */
export const runCheckinGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderItemIds: string[]; mode?: "code" | "vision" }) => data)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { userId } = context as { userId: string };
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isStaff } = await sb.rpc("has_role", { _user_id: userId, _role: "user" });
    if (!isAdmin && !isStaff) throw new Error("Sem permissão");

    const ids = Array.from(new Set((data.orderItemIds || []).filter(Boolean)));
    if (ids.length === 0) throw new Error("orderItemIds obrigatório");

    const itemsRes = await sb.from("order_items")
      .select("id, order_id, kind, details, supplier_locator")
      .in("id", ids);
    const items = (itemsRes.data ?? []) as any[];
    if (items.length === 0) throw new Error("Itens não encontrados");
    if (items.some((it) => it.kind !== "flight")) throw new Error("Todos os itens precisam ser aéreos");

    const orderId = items[0].order_id;
    if (items.some((it) => it.order_id !== orderId)) throw new Error("Itens devem ser do mesmo pedido");

    const airline = detectAirline({ airline: items[0].details?.airline, flight_number: items[0].details?.flight_number });
    if (airline !== "LATAM") throw new Error("Fase 1 só suporta LATAM");

    // Extrai localizador e URL de check-in a partir de qualquer item
    let checkinUrl = "";
    let latamOrderId = "";
    for (const it of items) {
      const u = String(it.details?.airline_checkin_url || "").trim();
      if (u && !checkinUrl) checkinUrl = u;
      try {
        const oid = new URL(u).searchParams.get("orderId")?.trim().toUpperCase() || "";
        if (oid && !latamOrderId) latamOrderId = oid;
      } catch { /* ignore */ }
    }
    const locator = (
      latamOrderId ||
      items[0].details?.purchase_order ||
      items[0].details?.order_id ||
      items[0].supplier_locator ||
      items[0].details?.locator ||
      ""
    ).toString().trim().toUpperCase();
    if (!locator) throw new Error("Localizador ausente");

    const paxRes = await sb.from("order_passengers").select("id, full_name").eq("order_id", orderId).order("sort_order", { ascending: true }).limit(1);
    const firstPax = (paxRes.data as any[])?.[0];
    const surname = firstPax?.full_name?.split(/\s+/).slice(-1)[0] ?? "";
    if (!surname) throw new Error("Sobrenome do passageiro não encontrado");

    // Ordena itens por horário de partida (para fallback por índice)
    items.sort((a, b) => {
      const da = new Date(a.details?.depart_at || a.details?.departure_at || 0).getTime();
      const db = new Date(b.details?.depart_at || b.details?.departure_at || 0).getTime();
      return da - db;
    });

    const mode = "autopilot" as const;

    // Upsert um check-in por item, marca running
    const checkins: any[] = [];
    for (const it of items) {
      const up = await sb.from("flight_checkins").upsert({
        order_id: orderId,
        order_item_id: it.id,
        passenger_id: firstPax?.id ?? null,
        cia: airline,
        locator,
        pnr_surname: surname,
        flight_number: it.details?.flight_number ?? null,
        departure_at: it.details?.depart_at ?? it.details?.departure_at ?? null,
        status: "running",
        mode,
      }, { onConflict: "order_item_id,passenger_id" }).select("*").single();
      checkins.push(up.data);
    }

    const startedAt = Date.now();
    try {
      const { runLatamAutopilot } = await import("./latam-autopilot.server");
      const result: any = await runLatamAutopilot({ locator, surname, checkinUrl });
      const visionCostCents: number | null = result.meta?.visionCostCents ?? null;
      // Autopilot devolve UM PDF só (normalmente contém todos os cartões
      // da reserva). Salvamos o mesmo arquivo em cada check-in do grupo.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const pdfBytes = Uint8Array.from(atob(result.boardingPassBase64), (c) => c.charCodeAt(0));
      const contentType = result.contentType || "application/pdf";

      const results: Array<{ id: string; ok: boolean; url?: string | null; error?: string }> = [];
      for (const ci of checkins) {
        const path = `${orderId}/${ci.id}.pdf`;
        const up = await supabaseAdmin.storage.from("boarding-passes")
          .upload(path, pdfBytes, { contentType, upsert: true });
        if (up.error) {
          await sb.from("flight_checkins").update({ status: "failed", error: `Storage: ${up.error.message}` }).eq("id", ci.id);
          results.push({ id: ci.id, ok: false, error: up.error.message });
          continue;
        }
        const signed = await supabaseAdmin.storage.from("boarding-passes").createSignedUrl(path, 60 * 60 * 24 * 30);
        const url = signed.data?.signedUrl ?? null;
        await sb.from("flight_checkins").update({
          status: "success",
          boarding_pass_path: path,
          boarding_pass_url: url,
          completed_at: new Date().toISOString(),
          run_duration_ms: Date.now() - startedAt,
          vision_cost_cents: visionCostCents,
        }).eq("id", ci.id);
        try {
          const { deliverBoardingPass } = await import("./deliver.server");
          await deliverBoardingPass(ci.id);
        } catch (e) {
          console.error("[checkin] delivery failed", e);
        }
        results.push({ id: ci.id, ok: true, url });
      }


      return { ok: true, results } as const;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[checkin] group automation failed", { error: msg.slice(0, 5_000) });
      const friendlyError = "O check-in não terminou nesta sessão. O robô fará uma nova tentativa automática.";
      for (const ci of checkins) {
        await sb.from("flight_checkins").update({ status: "failed", error: friendlyError }).eq("id", ci.id);
      }
      const manualUrl = locator && surname
        ? `https://www.latamairlines.com/br/pt/check-in/status?orderId=${encodeURIComponent(locator)}&lastName=${encodeURIComponent(surname.toLowerCase())}`
        : (checkinUrl || null);
      return { ok: false, error: friendlyError, manualUrl } as const;
    }
  });
