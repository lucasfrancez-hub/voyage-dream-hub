/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { catalogIngestSchema, type CatalogProductInput } from "@/lib/catalog/types";

/**
 * Endpoint público chamado pela extensão do navegador rodando dentro do
 * portal da operadora (Infotravel). A autenticação é feita pelo TOKEN da
 * execução (`catalog_import_runs.config.token`), gerado no admin.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/catalog-import")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = catalogIngestSchema.parse(await request.json());
        } catch (err) {
          return json({ error: `Payload inválido: ${(err as Error).message}` }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin;

        const { data: run } = await admin
          .from("catalog_import_runs")
          .select("id, status, operator_slug, total_found, total_new, total_updated, total_errors, config")
          .eq("config->>token", parsed.token)
          .maybeSingle();
        if (!run) return json({ error: "Token inválido" }, 401);
        if (run.status === "cancelled") return json({ status: "cancelled" });

        const logs: any[] = [];
        for (const e of parsed.errors ?? []) {
          logs.push({ run_id: run.id, level: "error", message: e.message, context: e.context ?? {} });
        }

        let created = 0;
        let updated = 0;

        if (parsed.action === "ingest" && parsed.products?.length) {
          // operadora
          const { data: op } = await admin
            .from("catalog_operators")
            .select("id")
            .eq("slug", run.operator_slug ?? "infotravel-generico")
            .maybeSingle();
          let operatorId = op?.id as string | undefined;
          if (!operatorId) {
            const { data: ins } = await admin
              .from("catalog_operators")
              .insert({ slug: run.operator_slug ?? "infotravel-generico", name: run.operator_slug ?? "Infotravel", portal: "infotravel" })
              .select("id")
              .single();
            operatorId = ins?.id as string | undefined;
          }
          if (!operatorId) return json({ error: "Operadora não resolvida" }, 500);

          for (const p of parsed.products as CatalogProductInput[]) {
            try {
              const destinationId = await upsertDestination(admin, p);
              const categoryId = await upsertCategory(admin, operatorId, p);

              const { data: existing } = await admin
                .from("catalog_products")
                .select("id")
                .eq("operator_id", operatorId)
                .eq("external_code", p.external_code)
                .maybeSingle();

              const row = {
                operator_id: operatorId,
                category_id: categoryId,
                destination_id: destinationId,
                external_code: p.external_code,
                internal_code: p.internal_code ?? null,
                name: p.name,
                subtitle: p.subtitle ?? null,
                description: p.description ?? null,
                summary: p.summary ?? null,
                highlights: p.highlights ?? [],
                service_type: p.service_type ?? null,
                duration: p.duration ?? null,
                language: p.language ?? null,
                schedules: p.schedules ?? [],
                available_days: p.available_days ?? [],
                departure_place: p.departure_place ?? null,
                return_place: p.return_place ?? null,
                meeting_point: p.meeting_point ?? null,
                cancellation_policy: p.cancellation_policy ?? null,
                change_policy: p.change_policy ?? null,
                important_info: p.important_info ?? null,
                notes: p.notes ?? null,
                requirements: p.requirements ?? null,
                includes: p.includes ?? [],
                not_includes: p.not_includes ?? [],
                supplier: p.supplier ?? null,
                currency: p.currency ?? null,
                price: p.price ?? null,
                destination_label: p.destination ?? null,
                city: p.city ?? null,
                state: p.state ?? null,
                country: p.country ?? null,
                product_url: p.product_url ?? null,
                raw: (p.raw ?? {}) as any,
                status: "ativo",
                last_seen_at: new Date().toISOString(),
              };

              let productId: string;
              if (existing?.id) {
                const { error } = await admin.from("catalog_products").update(row as any).eq("id", existing.id);
                if (error) throw new Error(error.message);
                productId = existing.id as string;
                updated++;
                await admin.from("catalog_product_history").insert({
                  product_id: productId,
                  run_id: run.id,
                  change_type: "update",
                  snapshot: row as any,
                });
              } else {
                const { data: ins, error } = await admin
                  .from("catalog_products")
                  .insert(row as any)
                  .select("id")
                  .single();
                if (error) throw new Error(error.message);
                productId = ins.id as string;
                created++;
                await admin.from("catalog_product_history").insert({
                  product_id: productId,
                  run_id: run.id,
                  change_type: "create",
                  snapshot: row as any,
                });
              }

              // imagens
              if (p.images?.length) {
                const imgs = p.images
                  .filter((u) => /^https?:\/\//i.test(u))
                  .map((url, i) => ({ product_id: productId, url, position: i }));
                if (imgs.length) {
                  await admin.from("catalog_product_images").upsert(imgs, { onConflict: "product_id,url" });
                }
              }

              // disponibilidade do período pesquisado (nunca sobrescreve outros)
              let availabilityId: string | null = null;
              if (p.period_start && p.period_end) {
                const { data: av } = await admin
                  .from("catalog_availabilities")
                  .upsert(
                    {
                      product_id: productId,
                      period_start: p.period_start,
                      period_end: p.period_end,
                      available: p.available ?? true,
                      searched_at: new Date().toISOString(),
                      details: {},
                    },
                    { onConflict: "product_id,period_start,period_end" },
                  )
                  .select("id")
                  .single();
                availabilityId = (av?.id as string) ?? null;
              }

              // tarifas
              const rates = p.rates ?? (p.price != null ? [{ amount: p.price, currency: p.currency }] : []);
              if (rates.length) {
                await admin.from("catalog_rates").insert(
                  rates.map((r) => ({
                    product_id: productId,
                    availability_id: availabilityId,
                    label: r.label ?? null,
                    currency: r.currency ?? p.currency ?? "BRL",
                    amount: r.amount ?? null,
                    rate_type: r.rate_type ?? null,
                    details: {},
                  })),
                );
              }
            } catch (err) {
              logs.push({
                run_id: run.id,
                level: "error",
                message: `Falha ao gravar "${p.name}": ${(err as Error).message}`,
                context: { external_code: p.external_code },
              });
            }
          }
        }

        // finalização: inativa produtos que não apareceram mais
        let deactivated = 0;
        if (parsed.action === "finish" && parsed.seen_codes?.length) {
          const { data: op } = await admin
            .from("catalog_operators")
            .select("id")
            .eq("slug", run.operator_slug ?? "infotravel-generico")
            .maybeSingle();
          if (op?.id) {
            const { data: gone } = await admin
              .from("catalog_products")
              .select("id")
              .eq("operator_id", op.id)
              .eq("status", "ativo")
              .not("external_code", "in", `(${parsed.seen_codes.map((c) => `"${c.replace(/"/g, "")}"`).join(",")})`);
            for (const g of gone ?? []) {
              await admin.from("catalog_products").update({ status: "inativo" }).eq("id", g.id);
              deactivated++;
            }
          }
        }

        const errorCount = logs.filter((l) => l.level === "error").length;
        if (logs.length) await admin.from("catalog_import_logs").insert(logs);

        const nextStatus =
          parsed.action === "finish" ? "done" : run.status === "paused" ? "paused" : run.status;

        await admin
          .from("catalog_import_runs")
          .update({
            total_found: (run.total_found ?? 0) + (parsed.products?.length ?? 0),
            total_new: (run.total_new ?? 0) + created,
            total_updated: (run.total_updated ?? 0) + updated,
            total_errors: (run.total_errors ?? 0) + errorCount,
            progress: (parsed.progress ?? {}) as any,
            status: nextStatus,
            finished_at: parsed.action === "finish" ? new Date().toISOString() : null,
            report:
              parsed.action === "finish"
                ? ({ deactivated, finished_at: new Date().toISOString() } as any)
                : {},
          })
          .eq("id", run.id);

        return json({ ok: true, status: nextStatus, created, updated, errors: errorCount, deactivated });
      },
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertDestination(admin: any, p: CatalogProductInput): Promise<string | null> {
  const name = (p.destination || p.city || "").trim();
  if (!name) return null;
  const city = (p.city || "").trim() || null;
  const country = (p.country || "").trim() || null;
  const { data } = await admin
    .from("catalog_destinations")
    .upsert({ name, city, country, state: p.state ?? null }, { onConflict: "name,city,country" })
    .select("id")
    .maybeSingle();
  return (data?.id as string) ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertCategory(admin: any, operatorId: string, p: CatalogProductInput): Promise<string | null> {
  const name = (p.category || p.service_type || "").trim();
  if (!name) return null;
  const { data } = await admin
    .from("catalog_categories")
    .upsert(
      { operator_id: operatorId, name, subcategory: p.subcategory ?? null },
      { onConflict: "operator_id,name,subcategory" },
    )
    .select("id")
    .maybeSingle();
  return (data?.id as string) ?? null;
}
