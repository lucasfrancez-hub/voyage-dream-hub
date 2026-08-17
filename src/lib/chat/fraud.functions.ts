/**
 * Server functions do motor antifraude (uso interno do inbox).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getFraudRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const { loadFraudState } = await import("@/lib/whatsapp/fraud/engine.server");
    return await loadFraudState(data.conversation_id);
  });

/** Reavaliação retrospectiva: lê o histórico inteiro, não envia nada ao cliente. */
export const reevaluateFraud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid().optional(),
        wa_phone: z.string().min(8).optional(),
      })
      .refine((v) => v.conversation_id || v.wa_phone, "Informe a conversa ou o número")
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let convId = data.conversation_id ?? null;
    if (!convId && data.wa_phone) {
      const digits = data.wa_phone.replace(/\D/g, "");
      const { data: conv } = await supabaseAdmin
        .from("wa_conversations")
        .select("id")
        .ilike("wa_phone", `%${digits.slice(-11)}`)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      convId = (conv as { id?: string } | null)?.id ?? null;
    }
    if (!convId) throw new Error("Conversa não encontrada");
    const { evaluateConversationFraud } = await import("@/lib/whatsapp/fraud/engine.server");
    return await evaluateConversationFraud({ conversation_id: convId, source: "manual" });
  });

/** Histórico de avaliações (auditoria: por que essa conversa ficou de alto risco?). */
export const listFraudEvaluations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("wa_fraud_evaluations")
      .select(
        "id, risk_before, risk_after, level_before, level_after, signals_added, reducers_added, clusters_detected, summary, source, transfer_triggered, evaluated_at",
      )
      .eq("conversation_id", data.conversation_id)
      .order("evaluated_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
