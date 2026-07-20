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
 * Fluxo MANUAL: agrupa próximos voos LATAM (7 dias) por localizador, com
 * segmentos, passageiros e o registro atual de flight_checkins de cada
 * segmento. O admin baixa o cartão de cada passageiro pelo link da LATAM,
 * anexa e envia via WhatsApp.
 */
export const listManualQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    const nowIso = now.toISOString();

    const { data: items } = await sb
      .from("order_items")
      .select("id, order_id, details, supplier_locator, order:orders(id, order_number, full_name, deleted_at)")
      .eq("kind", "flight")
      .or(`and(details->>depart_at.gte.${nowIso},details->>depart_at.lte.${in7d}),and(details->>departure_at.gte.${nowIso},details->>departure_at.lte.${in7d})`)
      .limit(500);

    // Tabela IATA → país para detectar internacional
    let iataTable: Record<string, { co?: string }> = {};
    try {
      iataTable = (await import("@/lib/iata-cities.json")).default as any;
    } catch { /* noop */ }
    const isBR = (iata?: string | null) => {
      if (!iata) return true;
      const rec = iataTable[iata.toUpperCase()];
      if (!rec?.co) return true;
      return rec.co.toLowerCase().startsWith("bras");
    };

    const flightItems = ((items ?? []) as any[])
      .filter((it) => !it.order?.deleted_at)
      .map((it) => {
        const airline = detectAirline({ airline: it.details?.airline, flight_number: it.details?.flight_number });
        const url = String(it.details?.airline_checkin_url || "");
        let latamOrderId = "";
        try { latamOrderId = new URL(url).searchParams.get("orderId")?.trim().toUpperCase() || ""; } catch { /* noop */ }
        const locator = (
          latamOrderId ||
          it.details?.purchase_order ||
          it.details?.order_id ||
          it.supplier_locator ||
          it.details?.locator ||
          ""
        ).toString().trim().toUpperCase();
        const origin = it.details?.from_iata ?? it.details?.origin ?? null;
        const destination = it.details?.to_iata ?? it.details?.destination ?? null;
        return {
          id: it.id as string,
          order_id: it.order_id as string,
          order: it.order,
          locator,
          airline,
          airline_label: it.details?.airline ?? airline ?? "Voo",
          is_intl: !isBR(origin) || !isBR(destination),
          flight_number: it.details?.flight_number ?? null,
          departure_at: it.details?.depart_at ?? it.details?.departure_at ?? null,
          origin,
          destination,
        };
      })
      .filter((it) => it.locator);


    const orderIds = Array.from(new Set(flightItems.map((it) => it.order_id)));
    const itemIds = flightItems.map((it) => it.id);

    const [{ data: pax }, { data: ci }] = await Promise.all([
      orderIds.length
        ? sb.from("order_passengers")
            .select("id, order_id, full_name, passenger_type, sort_order, whatsapp")
            .in("order_id", orderIds)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      itemIds.length
        ? sb.from("flight_checkins")
            .select("id, order_item_id, passenger_id, status, boarding_passes, delivered_wa_at, boarding_pass_path, updated_at")
            .in("order_item_id", itemIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const paxByOrder = new Map<string, any[]>();
    for (const p of (pax ?? []) as any[]) {
      const arr = paxByOrder.get(p.order_id) ?? [];
      arr.push(p);
      paxByOrder.set(p.order_id, arr);
    }
    const ciByItem = new Map<string, any>();
    for (const c of (ci ?? []) as any[]) {
      const current = ciByItem.get(c.order_item_id);
      const score = (row: any) => {
        const passCount = Array.isArray(row?.boarding_passes) ? row.boarding_passes.length : 0;
        const isManualJourney = row?.passenger_id == null ? 1 : 0;
        return isManualJourney * 1_000_000 + passCount * 10_000 + new Date(row?.updated_at || 0).getTime() / 1e13;
      };
      // Pode existir um registro legado por passageiro no mesmo trecho. Na fila
      // manual, o registro consolidado (passenger_id nulo) e com anexos é canônico.
      if (!current || score(c) > score(current)) ciByItem.set(c.order_item_id, c);
    }

    // Agrupa por (order_id + locator) — cada reserva é um card
    const groups = new Map<string, any>();
    for (const it of flightItems) {
      const key = `${it.order_id}::${it.locator}`;
      let g = groups.get(key);
      if (!g) {
        const passengers = (paxByOrder.get(it.order_id) ?? []).map((p, i) => {
          const type = (p.passenger_type ?? "ADT") as "ADT" | "CHD" | "INF";
          return { id: p.id, index: i + 1, full_name: p.full_name, passenger_type: type, whatsapp: p.whatsapp };
        });
        // tripPassengerId da LATAM é sequencial por tipo (ADT_1, ADT_2, CHD_1…).
        const perTypeCount: Record<string, number> = {};
        for (const p of passengers) {
          perTypeCount[p.passenger_type] = (perTypeCount[p.passenger_type] ?? 0) + 1;
          (p as any).trip_passenger_id = `${p.passenger_type}_${perTypeCount[p.passenger_type]}`;
        }
        const surname = passengers[0]?.full_name?.split(/\s+/).slice(-1)[0]?.toLowerCase() ?? "";
        g = {
          key,
          order: it.order,
          locator: it.locator,
          surname,
          passengers,
          segments: [] as any[],
        };
        groups.set(key, g);
      }
      const checkin = ciByItem.get(it.id) ?? null;
      g.segments.push({
        order_item_id: it.id,
        airline: it.airline,
        airline_label: it.airline_label,
        is_intl: it.is_intl,
        flight_number: it.flight_number,
        departure_at: it.departure_at,
        origin: it.origin,
        destination: it.destination,
        checkin,
      });

    }

    // Ordena segmentos por horário e injeta segment_index
    const list = Array.from(groups.values()).map((g) => {
      g.segments.sort((a: any, b: any) => new Date(a.departure_at || 0).getTime() - new Date(b.departure_at || 0).getTime());
      g.segments.forEach((s: any, i: number) => { s.segment_index = i; });
      return g;
    });
    list.sort((a, b) => {
      const da = new Date(a.segments[0]?.departure_at || 0).getTime();
      const db = new Date(b.segments[0]?.departure_at || 0).getTime();
      return da - db;
    });
    return list;
  });

/**
 * Upload MANUAL: admin anexa o cartão baixado da LATAM para um passageiro
 * específico de um segmento. Cria o registro de flight_checkins se não existir
 * e adiciona/substitui o cartão no array `boarding_passes` no índice do pax.
 */
export const uploadManualBoardingPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    orderItemId: string;
    passengerIndex: number;
    fileBase64: string;
    ext: "pdf" | "png" | "jpg";
    contentType: string;
  }) => data)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { userId } = context as { userId: string };
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isStaff } = await sb.rpc("has_role", { _user_id: userId, _role: "user" });
    if (!isAdmin && !isStaff) throw new Error("Sem permissão");

    const { data: item } = await sb
      .from("order_items")
      .select("id, order_id, details, supplier_locator")
      .eq("id", data.orderItemId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado");

    const airline = detectAirline({ airline: item.details?.airline, flight_number: item.details?.flight_number });
    const url = String(item.details?.airline_checkin_url || "");
    let latamOrderId = "";
    try { latamOrderId = new URL(url).searchParams.get("orderId")?.trim().toUpperCase() || ""; } catch { /* noop */ }
    const locator = (
      latamOrderId || item.details?.purchase_order || item.details?.order_id ||
      item.supplier_locator || item.details?.locator || ""
    ).toString().trim().toUpperCase();

    const { data: paxRow } = await sb
      .from("order_passengers")
      .select("full_name")
      .eq("order_id", item.order_id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const surname = paxRow?.full_name?.split(/\s+/).slice(-1)[0] ?? "";

    // upsert do check-in (passenger_id NULL: registro único por segmento)
    let { data: existing } = await sb
      .from("flight_checkins")
      .select("id, boarding_passes")
      .eq("order_item_id", data.orderItemId)
      .is("passenger_id", null)
      .maybeSingle();

    if (!existing) {
      const ins = await sb.from("flight_checkins").insert({
        order_id: item.order_id,
        order_item_id: item.id,
        passenger_id: null,
        cia: airline ?? "LATAM",
        locator: locator || "MANUAL",
        pnr_surname: surname,
        flight_number: item.details?.flight_number ?? null,
        departure_at: item.details?.depart_at ?? item.details?.departure_at ?? null,
        status: "pending",
        mode: "code",
      }).select("id, boarding_passes").single();
      if (ins.error) throw new Error(ins.error.message);
      existing = ins.data as any;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const path = `manual/${item.order_id}/${existing.id}/pax-${data.passengerIndex}.${data.ext}`;
    const up = await supabaseAdmin.storage.from("boarding-passes")
      .upload(path, bytes, { contentType: data.contentType, upsert: true });
    if (up.error) throw new Error(`Storage: ${up.error.message}`);

    const currentArr: Array<{ path: string; url: string | null; passenger_index: number }> =
      Array.isArray(existing.boarding_passes) ? (existing.boarding_passes as any) : [];
    const filtered = currentArr.filter((p) => p.passenger_index !== data.passengerIndex);
    filtered.push({ path, url: null, passenger_index: data.passengerIndex });
    filtered.sort((a, b) => a.passenger_index - b.passenger_index);

    // A autorização já foi validada com o cliente do usuário. Persistimos com o
    // cliente administrativo para que o arquivo e seu vínculo sejam atômicos e
    // não dependam de variações de políticas antigas desta tabela.
    const persisted = await supabaseAdmin.from("flight_checkins").update({
      boarding_passes: filtered,
      boarding_pass_path: filtered[0]?.path ?? path,
      status: "success",
      error: null,
      completed_at: new Date().toISOString(),
    }).eq("id", existing.id).select("id, boarding_passes").single();
    if (persisted.error) {
      await supabaseAdmin.storage.from("boarding-passes").remove([path]);
      throw new Error(`Não foi possível fixar o anexo: ${persisted.error.message}`);
    }

    const savedPasses = Array.isArray(persisted.data?.boarding_passes)
      ? persisted.data.boarding_passes
      : filtered;
    return { ok: true, checkinId: existing.id, count: savedPasses.length };
  });

/**
 * Remove o cartão de um passageiro específico do check-in manual.
 */
export const removeManualBoardingPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { checkinId: string; passengerIndex: number }) => data)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { userId } = context as { userId: string };
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isStaff } = await sb.rpc("has_role", { _user_id: userId, _role: "user" });
    if (!isAdmin && !isStaff) throw new Error("Sem permissão");

    const { data: row } = await sb.from("flight_checkins")
      .select("id, boarding_passes")
      .eq("id", data.checkinId).maybeSingle();
    if (!row) throw new Error("Check-in não encontrado");
    const arr: Array<{ path: string; passenger_index: number }> =
      Array.isArray(row.boarding_passes) ? (row.boarding_passes as any) : [];
    const removed = arr.find((p) => p.passenger_index === data.passengerIndex);
    const remaining = arr.filter((p) => p.passenger_index !== data.passengerIndex);
    if (removed) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("boarding-passes").remove([removed.path]);
    }
    await sb.from("flight_checkins").update({
      boarding_passes: remaining,
      boarding_pass_path: remaining[0]?.path ?? null,
      status: remaining.length > 0 ? "success" : "pending",
      delivered_wa_at: remaining.length > 0 ? null : null,
    }).eq("id", data.checkinId);
    return { ok: true, count: remaining.length };
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
  .inputValidator((data: { checkinId?: string; orderItemId?: string; passengerId?: string | null }) => data)
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

    // `mode` mantém o valor compatível com a coluna existente; a execução
    // real é exclusivamente o script salvo em sessão viva/CDP.
    const mode = "code" as const;

    // Marca running
    await sb.from("flight_checkins")
      .update({ status: "running", mode, last_attempt_at: new Date().toISOString(), attempts: (checkin.attempts ?? 0) + 1, error: null })
      .eq("id", checkin.id);

    const startedAt = Date.now();
    try {
      // Conta os passageiros da reserva pra casar com o script de treino salvo (1 pax, 2 pax, …).
      const paxCountRes = await sb
        .from("order_passengers")
        .select("id", { count: "exact", head: true })
        .eq("order_id", checkin.order_id);
      const paxCount = (paxCountRes as any).count ?? null;
      // Só usa o script salvo no treinador de check-in (autopilot antigo foi removido).
      const result: any = await tryRunFromSavedScript(sb, {
        airline: "LATAM",
        locator: checkin.locator,
        surname: checkin.pnr_surname,
        runnerUserId: `manual:${userId}:${checkin.id}`,
        paxCount,
      });

      if (!result) {
        throw new Error("Nenhum script de treinador salvo para LATAM. Grave um script em /admin/checkin-treino antes de rodar o check-in.");
      }

      const visionCostCents: number | null = result.meta?.visionCostCents ?? null;

      // Upload no storage do cartão capturado pelo script salvo.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const isPng = (result.contentType || "").includes("png");
      const path = `${checkin.order_id}/${checkin.id}.${isPng ? "png" : "pdf"}`;
      const bytes = Uint8Array.from(atob(result.boardingPassBase64), (c) => c.charCodeAt(0));
      const up = await supabaseAdmin.storage
        .from("boarding-passes")
        .upload(path, bytes, { contentType: result.contentType, upsert: true });

      if (up.error) throw new Error(`Storage: ${up.error.message}`);

      // Signed URL 30 dias
      const signed = await supabaseAdmin.storage.from("boarding-passes").createSignedUrl(path, 60 * 60 * 24 * 30);
      const url = signed.data?.signedUrl ?? null;

      await sb.from("flight_checkins").update({
        status: "success",
        boarding_pass_path: path,
        boarding_pass_url: url,
        error: null,
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

      const friendlyError = formatTrainingFailure(msg);

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

    const mode = "code" as const;

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
      const paxCountRes = await sb
        .from("order_passengers")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId);
      const paxCount = (paxCountRes as any).count ?? null;
      // Só usa o script salvo do treinador (autopilot antigo removido).
      const result: any = await tryRunFromSavedScript(sb, {
        airline: "LATAM",
        locator,
        surname,
        runnerUserId: `manual:${userId}:${orderId}`,
        paxCount,
      });

      if (!result) {
        throw new Error("Nenhum script de treinador salvo para LATAM. Grave um script em /admin/checkin-treino antes de rodar o check-in.");
      }

      const visionCostCents: number | null = result.meta?.visionCostCents ?? null;
      // O script salvo devolve o PNG capturado no treinador.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const passBytes = Uint8Array.from(atob(result.boardingPassBase64), (c) => c.charCodeAt(0));
      const contentType = result.contentType || "application/pdf";
      const ext = contentType.includes("png") ? "png" : "pdf";


      const results: Array<{ id: string; ok: boolean; url?: string | null; error?: string }> = [];
      for (const ci of checkins) {
        const path = `${orderId}/${ci.id}.${ext}`;
        const up = await supabaseAdmin.storage.from("boarding-passes")
          .upload(path, passBytes, { contentType, upsert: true });

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
          error: null,
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
      const friendlyError = formatTrainingFailure(msg);
      for (const ci of checkins) {
        await sb.from("flight_checkins").update({ status: "failed", error: friendlyError }).eq("id", ci.id);
      }
      const manualUrl = locator && surname
        ? `https://www.latamairlines.com/br/pt/check-in/status?orderId=${encodeURIComponent(locator)}&lastName=${encodeURIComponent(surname.toLowerCase())}`
        : (checkinUrl || null);
      return { ok: false, error: friendlyError, manualUrl } as const;
    }
  });

/**
 * Busca o script salvo mais recente da companhia no treinador e roda no
 * navegador remoto usando o localizador/sobrenome reais da reserva.
 * Devolve o cartão capturado, ou null se não houver script salvo (ou se ele
 * não capturar nenhuma região).
 */
async function tryRunFromSavedScript(
  sb: any,
  args: { airline: "LATAM" | "GOL" | "AZUL"; locator: string; surname: string; runnerUserId: string; paxCount?: number | null },
): Promise<{ boardingPassBase64: string; contentType: string; meta: Record<string, unknown> } | null> {
  if (!args.locator || !args.surname) return null;
  const { data: rows } = await sb
    .from("checkin_training_scripts")
    .select("id, name, initial_url, steps, viewport_width, viewport_height, pax_count")
    .eq("airline", args.airline)
    .order("updated_at", { ascending: false });
  const all = (rows ?? []) as any[];
  if (all.length === 0) return null;
  // 1) Prefer exact pax match, 2) fallback to script sem pax_count definido, 3) qualquer script.
  const pax = args.paxCount ?? null;
  const script =
    (pax != null && all.find((s) => Number(s.pax_count) === Number(pax))) ||
    all.find((s) => s.pax_count == null) ||
    all[0];
  if (!script || !Array.isArray(script.steps) || script.steps.length === 0) return null;
  const { runScriptInLiveSession, rebuildInitialUrlForOrder } = await import("./training-runner.server");
  const url = rebuildInitialUrlForOrder(script.initial_url, args.locator, args.surname);
  const result = await runScriptInLiveSession({
    userId: args.runnerUserId,
    url,
    steps: script.steps as any,
    viewportWidth: script.viewport_width ?? 1280,
    viewportHeight: script.viewport_height ?? 900,
    locator: args.locator,
    surname: args.surname,
  });
  const png = (result.captures || []).find((c) => c.pngBase64);
  if (!png) return null;
  return {
    boardingPassBase64: png.pngBase64,
    contentType: "image/png",
    meta: { via: "training_script", scriptId: script.id, scriptName: script.name, scriptPaxCount: script.pax_count ?? null, matchedPax: pax },
  };
}


function formatTrainingFailure(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  const step = cleaned.match(/Etapa \d+ \([^)]+\) falhou:[\s\S]*/i)?.[0];
  if (step) return step.slice(0, 700);
  if (/LATAM_NAVIGATION_BLOCKED|ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|ERR_CONNECTION_RESET/i.test(cleaned)) {
    return "A LATAM recusou a conexão da sessão protegida antes de abrir o check-in.";
  }
  if (/408|timed out|timeout|AbortError/i.test(cleaned)) {
    return "A sessão protegida atingiu o tempo limite antes de concluir o check-in.";
  }
  if (/não capturou|captur.*cartão|nenhuma região/i.test(cleaned)) {
    return "O script terminou, mas a etapa de captura não gerou o cartão de embarque.";
  }
  return cleaned.slice(0, 700) || "O script do treinador terminou sem informar o motivo da falha.";
}
