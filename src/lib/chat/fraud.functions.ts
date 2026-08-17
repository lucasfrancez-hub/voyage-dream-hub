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
        "id, risk_before, risk_after, confidence_after, level_before, level_after, trend, velocity, max_score, critical_flags, transfer_reason, signals_added, reducers_added, clusters_detected, summary, source, transfer_triggered, evaluated_at",
      )
      .eq("conversation_id", data.conversation_id)
      .order("evaluated_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Linha do tempo do score (item 18). */
export const listFraudTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("wa_fraud_events")
      .select("id, kind, score, confidence, level, label, detail, created_at")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Avaliação manual do time (item 22) — alimenta o score sem apagar histórico. */
export const submitFraudReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        action: z.enum([
          "verificado",
          "sinal_esclarecido",
          "risco_descartado",
          "observacao",
          "bloquear_venda",
        ]),
        signal_code: z.string().max(60).optional(),
        note: z.string().max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { registerFraudReview } = await import("@/lib/whatsapp/fraud/engine.server");
    return await registerFraudReview({
      conversation_id: data.conversation_id,
      action: data.action,
      signal_code: data.signal_code ?? null,
      note: data.note ?? null,
      reviewer: context.userId,
    });
  });

/** Desfecho da venda (item 23). */
export const setFraudOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        outcome: z.enum([
          "LEGITIMA",
          "FRAUDE_CONFIRMADA",
          "SUSPEITA_DESCARTADA",
          "NAO_CONCLUSIVA",
          "CANCELADA",
        ]),
        note: z.string().max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { registerFraudOutcome } = await import("@/lib/whatsapp/fraud/engine.server");
    await registerFraudOutcome({
      conversation_id: data.conversation_id,
      outcome: data.outcome,
      note: data.note ?? null,
      reviewer: context.userId,
    });
    return { ok: true };
  });

/** Evento de pagamento (metadados seguros) — segue alimentando o score. */
export const reportFraudPaymentEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        label: z.string().max(160).optional(),
        payment_attempt_count: z.number().int().min(0).max(50).optional(),
        payment_status: z.string().max(40).optional(),
        payment_method_changed: z.boolean().optional(),
        different_card_attempts: z.number().int().min(0).max(50).optional(),
        checkout_bypass: z.boolean().optional(),
        gateway_risk_result: z.enum(["approved", "review", "declined", "fraud"]).optional(),
        identity_match_result: z.enum(["match", "partial", "mismatch"]).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { conversation_id, label, ...meta } = data;
    const { registerFraudPaymentEvent } = await import("@/lib/whatsapp/fraud/engine.server");
    return await registerFraudPaymentEvent({ conversation_id, meta, label });
  });
