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
      .select("*, order:orders(id, order_number, full_name), item:order_items(details)")
      .order("departure_at", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
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

      const departureAt = item.details?.departure_at || null;

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

    // Marca running
    await sb.from("flight_checkins")
      .update({ status: "running", last_attempt_at: new Date().toISOString(), attempts: (checkin.attempts ?? 0) + 1, error: null })
      .eq("id", checkin.id);

    try {
      const { runLatamCheckin } = await import("./latam.server");
      const result = await runLatamCheckin({ locator: checkin.locator, surname: checkin.pnr_surname, checkinUrl: airlineCheckinUrl });

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
      }).eq("id", checkin.id);

      // Dispara entrega em background (não bloqueia a resposta)
      try {
        const { deliverBoardingPass } = await import("./deliver.server");
        await deliverBoardingPass(checkin.id);
      } catch (e) {
        console.error("[checkin] delivery failed", e);
      }

      return { ok: true, id: checkin.id, url } as const;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[checkin] LATAM automation failed", {
        checkinId: checkin.id,
        error: msg.slice(0, 5_000),
      });

      const isNavigationBlock = /ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|ERR_CONNECTION_RESET/i.test(msg);
      const isIncompleteFlow = /Fluxo LATAM terminou antes do cartão/i.test(msg);
      const isProviderTimeout = /Browserless HTTP 408|Request has timed out|AbortError/i.test(msg);
      const isLatamBlock = /Tivemo.? um problema|não foi po.?ível carregar|nao foi possivel carregar/i.test(msg);
      const friendlyError = isNavigationBlock || isProviderTimeout || isLatamBlock
        ? "A LATAM recusou temporariamente a conexão automática. O check-in ficou pendente e poderá ser tentado novamente."
        : isIncompleteFlow
          ? "A LATAM abriu a reserva, mas ainda não disponibilizou o cartão de embarque para download."
          : "Não foi possível concluir o check-in automático agora. Tente novamente em alguns minutos.";

      await sb.from("flight_checkins")
        .update({ status: "failed", error: friendlyError })
        .eq("id", checkin.id);

      // Falhas de fornecedores externos são retornadas como resultado tipado.
      // Não lançar aqui evita o overlay/blank screen do runtime no painel.
      return { ok: false, id: checkin.id, error: friendlyError, manualUrl: airlineCheckinUrl || null } as const;
    }
  });
