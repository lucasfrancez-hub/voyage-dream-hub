import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listarFilaManualAereo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Acesso restrito");
    const { data, error } = await context.supabase
      .from("airfare_manual_queue")
      .select("id,origin_iata,destination_iata,departure_date,return_date,status,detail,error,attempts,created_at,updated_at")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const retomarFilaManualAereo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !isAdmin) throw new Error("Acesso restrito");
    const { resumeManualQueue } = await import("@/lib/airfare-manual-queue.server");
    return resumeManualQueue();
  });

export const limparFilaManualAereo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ before: z.string().datetime() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Acesso restrito");
    const { error } = await context.supabase
      .from("airfare_manual_queue")
      .delete()
      .in("status", ["done", "error", "cancelled"])
      .lte("created_at", data.before);
    if (error) throw new Error(error.message);
    return { ok: true };
  });