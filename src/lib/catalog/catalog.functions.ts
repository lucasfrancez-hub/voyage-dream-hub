import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ensureAdmin, loadAdminClient, randomToken } from "./catalog.server";

export const listCatalogOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("catalog_operators")
      .select("id, slug, name, portal, active")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCatalogRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        operator_slug: z.string().min(1).max(100),
        destination: z.string().max(200).default(""),
        category: z.string().max(200).default(""),
        start_date: z.string().max(20).default(""),
        months: z.number().int().min(1).max(24).default(12),
        block_days: z.number().int().min(1).max(90).default(30),
        overlap_days: z.number().int().min(0).max(30).default(0),
        concurrency: z.number().int().min(1).max(6).default(2),
        delay_ms: z.number().int().min(0).max(60000).default(1200),
        import_all: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const token = randomToken();
    const admin = await loadAdminClient();
    const { data: row, error } = await admin
      .from("catalog_import_runs")
      .insert({
        operator_slug: data.operator_slug,
        destination: data.destination || null,
        category: data.category || null,
        status: "running",
        config: { ...data, token },
        progress: {},
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { runId: row.id as string, token };
  });

export const getCatalogRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const { data: run, error } = await context.supabase
      .from("catalog_import_runs")
      .select("*")
      .eq("id", data.runId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { data: logs } = await context.supabase
      .from("catalog_import_logs")
      .select("id, level, message, context, created_at")
      .eq("run_id", data.runId)
      .order("created_at", { ascending: false })
      .limit(50);
    return { run, logs: logs ?? [] };
  });

export const listCatalogRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("catalog_import_runs")
      .select("id, operator_slug, destination, category, status, total_found, total_new, total_updated, total_errors, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setCatalogRunStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      runId: z.string().uuid(),
      status: z.enum(["running", "paused", "cancelled", "done"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const finished =
      data.status === "cancelled" || data.status === "done" ? new Date().toISOString() : null;
    const { error } = await context.supabase
      .from("catalog_import_runs")
      .update({ status: data.status, finished_at: finished })
      .eq("id", data.runId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listCatalogProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      search: z.string().max(200).default(""),
      operator_slug: z.string().max(100).default(""),
      status: z.enum(["all", "ativo", "inativo"]).default("ativo"),
      limit: z.number().int().min(1).max(200).default(60),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    let q = context.supabase
      .from("catalog_products")
      .select(
        "id, external_code, name, subtitle, summary, description, destination_label, city, country, supplier, currency, price, duration, product_url, status, includes, not_includes, highlights, service_type, meeting_point, cancellation_policy, important_info, updated_at, catalog_operators(name, slug), catalog_product_images(url, position)",
      )
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const filtered = data.operator_slug
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (rows ?? []).filter((r: any) => r.catalog_operators?.slug === data.operator_slug)
      : (rows ?? []);
    return filtered;
  });
