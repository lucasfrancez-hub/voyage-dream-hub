/**
 * Server functions das notificações push do Chat (Central de Atendimento).
 * Autenticadas: cada atendente gerencia os próprios aparelhos.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const chaveVapidChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { chavePublicaVapid } = await import("@/lib/whatsapp/webpush.server");
    return { vapid: chavePublicaVapid() };
  });

export const salvarPushChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        endpoint: z.string().url(),
        p256dh: z.string().min(10),
        auth: z.string().min(5),
        userAgent: z.string().max(400).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("wa_chat_push_subs").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        ativo: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerPushChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ endpoint: z.string().url() }).parse(raw))
  .handler(async ({ data, context }) => {
    await context.supabase.from("wa_chat_push_subs").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const testarPushChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ endpoint: z.string().url() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("wa_chat_push_subs")
      .select("endpoint, p256dh, auth")
      .eq("endpoint", data.endpoint)
      .maybeSingle();
    if (!sub) return { ok: false, erro: "aparelho não encontrado" };
    const { enviarPush } = await import("@/lib/whatsapp/webpush.server");
    const r = await enviarPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { title: "VIA AIR Chat", body: "Notificações ativadas neste aparelho ✅", url: "/chat/inbox" },
    );
    return { ok: r.ok, erro: r.erro ?? null, status: r.status };
  });
