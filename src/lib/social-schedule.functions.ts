/**
 * Agendamento de publicações sociais (WhatsApp / Instagram).
 * O cron `/api/public/hooks/social-schedule-dispatch` executa os agendamentos.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const payloadSchema = z.union([
  z.object({
    kind: z.literal("whatsapp"),
    destino_ids: z.array(z.string().uuid()).min(1),
    texto: z.string().min(1),
    imagem_url: z.string().url().nullable().optional(),
  }),
  z.object({
    kind: z.literal("instagram"),
    account_id: z.string().uuid(),
    media_type: z.enum(["feed_image", "story_image"]),
    media_url: z.string().url(),
    caption: z.string().max(2200).nullable().optional(),
  }),
]);

export const agendarPublicacaoSocial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        channel: z.enum(["whatsapp", "instagram"]),
        scheduled_at: z.string().min(1),
        label: z.string().optional(),
        promo_id: z.string().uuid().nullable().optional(),
        payload: payloadSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admins podem agendar publicações");

    const quando = new Date(data.scheduled_at);
    if (Number.isNaN(quando.getTime())) throw new Error("Data do agendamento inválida");
    if (quando.getTime() < Date.now() - 60_000) throw new Error("Escolha uma data futura");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("social_scheduled_posts")
      .insert({
        channel: data.channel,
        scheduled_at: quando.toISOString(),
        label: data.label ?? null,
        promo_id: data.promo_id ?? null,
        payload: data.payload as never,
        created_by: context.userId,
      })
      .select("id, scheduled_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listarPublicacoesAgendadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("social_scheduled_posts")
      .select("id, channel, scheduled_at, status, label, promo_id, error, published_at, payload")
      .order("scheduled_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const cancelarPublicacaoAgendada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("social_scheduled_posts")
      .update({ status: "cancelado" })
      .eq("id", data.id)
      .eq("status", "agendado");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
