/**
 * Server functions do módulo Cruzeiros (admin).
 * Criar cruzeiro, controlar a sessão de importação e inspecionar capturas.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: apenas admin");
}

function randomToken(len = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const listCruises = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("cruises")
      .select("id, code, name, departure_date, nights, ship_name, operator, source, status, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const { data: session } = await context.supabase
      .from("cruise_import_sessions")
      .select("id, cruise_id, token")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    return { cruises: data ?? [], activeSession: session ?? null };
  });

export const createCruise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string;
    departure_date?: string;
    nights?: number | null;
    ship_name?: string;
    operator?: string;
    source?: string;
  }) => {
    const name = (d?.name ?? "").trim();
    if (!name) throw new Error("Nome do cruzeiro é obrigatório");
    return {
      name,
      departure_date: d.departure_date || null,
      nights: d.nights ?? null,
      ship_name: (d.ship_name ?? "").trim(),
      operator: (d.operator ?? "").trim(),
      source: (d.source ?? "FRT_KROOZE").trim(),
    };
  })
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase
      .from("cruises")
      .insert({ ...data, created_by: context.userId })
      .select("id, code")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row!;
  });

export const getCruise = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const sb = context.supabase;
    const [cruise, session, snapshots, offers, prices, itinerary, additionals, insurances, media] =
      await Promise.all([
        sb.from("cruises").select("*").eq("id", data.id).maybeSingle(),
        sb
          .from("cruise_import_sessions")
          .select("*")
          .eq("cruise_id", data.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from("cruise_import_snapshots")
          .select("id, seq, page_type, summary, detected, status, error, stats, url, captured_at")
          .eq("cruise_id", data.id)
          .order("captured_at", { ascending: false })
          .limit(200),
        sb.from("cruise_cabin_offers").select("*").eq("cruise_id", data.id).order("cabin_type"),
        sb
          .from("cruise_prices")
          .select("id, offer_id, occupancy_key, adults, young, children, infants, total, taxes, base_amount, is_current, captured_at")
          .eq("cruise_id", data.id)
          .order("captured_at", { ascending: false }),
        sb.from("cruise_itineraries").select("*").eq("cruise_id", data.id).order("day"),
        sb.from("cruise_additionals").select("*, prices:cruise_additional_prices(profile, price)").eq("cruise_id", data.id),
        sb.from("cruise_insurances").select("*").eq("cruise_id", data.id),
        sb.from("cruise_media").select("id, media_type, context, source_url, title").eq("cruise_id", data.id).limit(300),
      ]);

    if (!cruise.data) throw new Error("Cruzeiro não encontrado");

    let ship: Record<string, string | number | boolean | null> | null = null;
    let shipCounts = { media: 0, decks: 0, attractions: 0, cabins: 0 };
    if (cruise.data.ship_id) {
      const shipId = cruise.data.ship_id as string;
      const [s, m, d, a, c] = await Promise.all([
        sb.from("ships").select("*").eq("id", shipId).maybeSingle(),
        sb.from("ship_media").select("id", { count: "exact", head: true }).eq("ship_id", shipId),
        sb.from("ship_decks").select("id", { count: "exact", head: true }).eq("ship_id", shipId),
        sb.from("ship_attractions").select("id", { count: "exact", head: true }).eq("ship_id", shipId),
        sb.from("ship_cabins").select("id", { count: "exact", head: true }).eq("ship_id", shipId),
      ]);
      ship = (s.data ?? null) as typeof ship;
      shipCounts = {
        media: m.count ?? 0,
        decks: d.count ?? 0,
        attractions: a.count ?? 0,
        cabins: c.count ?? 0,
      };
    }

    return {
      cruise: cruise.data,
      session: session.data ?? null,
      snapshots: snapshots.data ?? [],
      offers: offers.data ?? [],
      prices: prices.data ?? [],
      itinerary: itinerary.data ?? [],
      additionals: additionals.data ?? [],
      insurances: insurances.data ?? [],
      media: media.data ?? [],
      ship,
      shipCounts,
    };
  });

/** Ativa a importação. `force` encerra a sessão ativa de outro cruzeiro. */
export const activateImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cruise_id: string; force?: boolean }) => ({
    cruise_id: String(d?.cruise_id ?? ""),
    force: Boolean(d?.force),
  }))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const sb = context.supabase;

    const { data: current } = await sb
      .from("cruise_import_sessions")
      .select("id, cruise_id, cruise:cruises(name)")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();

    if (current && current.cruise_id !== data.cruise_id) {
      if (!data.force) {
        return {
          conflict: true as const,
          activeCruiseName: (current.cruise as { name?: string } | null)?.name ?? "outro cruzeiro",
        };
      }
      await sb
        .from("cruise_import_sessions")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", current.id);
    }

    if (current && current.cruise_id === data.cruise_id) {
      return { conflict: false as const, ok: true as const };
    }

    const { data: cruise } = await sb
      .from("cruises")
      .select("code, source")
      .eq("id", data.cruise_id)
      .maybeSingle();
    const token = `${cruise?.code ?? "CRZ"}-${randomToken()}`;

    const { error } = await sb.from("cruise_import_sessions").insert({
      cruise_id: data.cruise_id,
      user_id: context.userId,
      token,
      status: "active",
      source: cruise?.source ?? "FRT_KROOZE",
    });
    if (error) throw new Error(error.message);
    await sb.from("cruise_import_logs").insert({
      cruise_id: data.cruise_id,
      user_id: context.userId,
      level: "info",
      message: "Importação ativada",
    });
    return { conflict: false as const, ok: true as const, token };
  });

export const setImportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { session_id: string; status: "active" | "paused" | "finished" }) => ({
    session_id: String(d?.session_id ?? ""),
    status: d.status,
  }))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const patch: Record<string, string> = { status: data.status };
    if (data.status === "finished") patch.finished_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("cruise_import_sessions")
      .update(patch as never)
      .eq("id", data.session_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const reprocessSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { snapshot_id?: string; cruise_id?: string }) => ({
    snapshot_id: d?.snapshot_id ? String(d.snapshot_id) : undefined,
    cruise_id: d?.cruise_id ? String(d.cruise_id) : undefined,
  }))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { reprocessSnapshot } = await import("./consolidate.server");

    let ids: string[] = [];
    if (data.snapshot_id) ids = [data.snapshot_id];
    else if (data.cruise_id) {
      const { data: rows } = await context.supabase
        .from("cruise_import_snapshots")
        .select("id")
        .eq("cruise_id", data.cruise_id)
        .order("captured_at", { ascending: true });
      ids = (rows ?? []).map((r: { id: string }) => r.id);
    }

    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await reprocessSnapshot(supabaseAdmin, id);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    return { ok, fail, total: ids.length };
  });

export const deleteSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { snapshot_id: string }) => ({ snapshot_id: String(d?.snapshot_id ?? "") }))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase
      .from("cruise_import_snapshots")
      .delete()
      .eq("id", data.snapshot_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Prévia interna do cruzeiro: exatamente o que foi importado, montado no
 * mesmo formato que o cliente veria — sem publicar nada no site público.
 */
export const getCruisePreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const sb = context.supabase;

    const { data: cruise } = await sb.from("cruises").select("*").eq("id", data.id).maybeSingle();
    if (!cruise) throw new Error("Cruzeiro não encontrado");

    const [offers, prices, itinerary, additionals, addPrices, insurances, media] = await Promise.all([
      sb.from("cruise_cabin_offers").select("*").eq("cruise_id", data.id).order("sort_order"),
      sb.from("cruise_prices").select("*").eq("cruise_id", data.id).eq("is_current", true),
      sb.from("cruise_itineraries").select("*").eq("cruise_id", data.id).order("day"),
      sb.from("cruise_additionals").select("*").eq("cruise_id", data.id),
      sb.from("cruise_additional_prices").select("*"),
      sb.from("cruise_insurances").select("*").eq("cruise_id", data.id),
      sb.from("cruise_media").select("*").eq("cruise_id", data.id).order("sort_order").limit(400),
    ]);

    let ship: Record<string, unknown> | null = null;
    let shipMedia: unknown[] = [];
    let decks: unknown[] = [];
    let attractions: unknown[] = [];
    let shipCabins: unknown[] = [];
    if (cruise.ship_id) {
      const shipId = cruise.ship_id as string;
      const [s, m, d2, a, c] = await Promise.all([
        sb.from("ships").select("*").eq("id", shipId).maybeSingle(),
        sb.from("ship_media").select("*").eq("ship_id", shipId).order("sort_order").limit(400),
        sb.from("ship_decks").select("*").eq("ship_id", shipId).order("sort_order"),
        sb.from("ship_attractions").select("*").eq("ship_id", shipId).order("sort_order"),
        sb.from("ship_cabins").select("*").eq("ship_id", shipId).order("name"),
      ]);
      ship = (s.data ?? null) as typeof ship;
      shipMedia = m.data ?? [];
      decks = d2.data ?? [];
      attractions = a.data ?? [];
      shipCabins = c.data ?? [];
    }

    const addIds = new Set((additionals.data ?? []).map((a: { id: string }) => a.id));
    const additionalsFull = (additionals.data ?? []).map((a: { id: string }) => ({
      ...a,
      prices: (addPrices.data ?? []).filter(
        (p: { additional_id: string }) => p.additional_id === a.id && addIds.has(a.id),
      ),
    }));

    return {
      cruise,
      ship,
      itinerary: itinerary.data ?? [],
      offers: offers.data ?? [],
      prices: prices.data ?? [],
      additionals: additionalsFull,
      insurances: insurances.data ?? [],
      media: media.data ?? [],
      shipMedia,
      decks,
      attractions,
      shipCabins,
    };
  });
