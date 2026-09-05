/**
 * Endpoints do fluxo de validação 3DS (equivalentes às edge functions
 * `create-3ds-validation` e `verify-3ds-validation` — neste projeto o backend
 * é o próprio servidor do app).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const reservaSchema = z.object({ reservaId: z.string().min(1).max(120) });

/** Chave publicável (pk_live_...) entregue ao navegador. */
export const stripeChavePublicavel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ chave: process.env["STRIPE_PUBLISHABLE_KEY"] ?? null }));

/** create-3ds-validation — autorização temporária de R$ 1,00 com desafio 3DS. */
export const criar3dsValidacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reservaSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const { criarValidacao3DS } = await import("./tres-ds.server");
      return { ok: true as const, ...(await criarValidacao3DS(data.reservaId)) };
    } catch (e) {
      return {
        ok: false as const,
        erro: e instanceof Error ? e.message : "Falha ao iniciar a validação do cartão.",
      };
    }
  });

/** verify-3ds-validation — confere o 3DS na Stripe e cancela a autorização. */
export const verificar3dsValidacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    reservaSchema.extend({ paymentIntentId: z.string().min(6).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verificarValidacao3DS } = await import("./tres-ds.server");
    return verificarValidacao3DS(data.reservaId, data.paymentIntentId);
  });

/** Situação atual da validação da reserva (para o card de status). */
export const situacao3dsReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reservaSchema.parse(input))
  .handler(async ({ data }) => {
    const { situacao3DS } = await import("./tres-ds.server");
    return situacao3DS(data.reservaId);
  });
