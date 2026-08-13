import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const periodo = z.object({ dias: z.number().int().min(1).max(365).default(30) });

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito");
}

export const obterMetricasSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => periodo.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { carregarMetricasSite } = await import("@/lib/analytics/metrics.server");
    return await carregarMetricasSite(data.dias);
  });

export const obterMetricasLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => periodo.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { carregarMetricasLinks } = await import("@/lib/analytics/metrics.server");
    return await carregarMetricasLinks(data.dias);
  });
