/**
 * Interruptor global da IA — leitura e alternância pelo painel.
 * Desligado = todas as conversas (atuais e futuras) só com atendimento humano.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getAiGlobalSwitch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("wa_ai_switch")
      .select("ai_enabled, updated_at")
      .eq("id", "global")
      .maybeSingle();
    return {
      ai_enabled: (data as { ai_enabled?: boolean | null } | null)?.ai_enabled ?? true,
      updated_at: (data as { updated_at?: string | null } | null)?.updated_at ?? null,
    };
  });

export const setAiGlobalSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ enabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_ai_switch")
      .upsert({
        id: "global",
        ai_enabled: data.enabled,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", "global");
    if (error) throw new Error(error.message);
    const { resetAiSwitchCache } = await import("@/lib/whatsapp/ai-global-switch.server");
    resetAiSwitchCache();
    return { ok: true, ai_enabled: data.enabled };
  });
