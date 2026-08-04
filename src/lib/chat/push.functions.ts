/**
 * Server functions das notificações Web Push do Chat (Central de Atendimento).
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
        deviceName: z.string().max(80).optional(),
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
        device_name: data.deviceName ?? null,
        ativo: true,
        failure_count: 0,
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

/** Aparelhos do atendente logado (para a tela de diagnóstico). */
export const listarAparelhosPushChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("wa_chat_push_subs")
      .select("id, endpoint, device_name, user_agent, ativo, failure_count, last_success_at, last_test_at, created_at")
      .order("created_at", { ascending: false });
    return (data ?? []).map((d) => ({
      ...d,
      // nunca devolvemos as chaves nem o endpoint inteiro
      endpoint: d.endpoint,
    }));
  });

export const testarPushChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ endpoint: z.string().url() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("wa_chat_push_subs")
      .select("id, endpoint, p256dh, auth, last_test_at, failure_count")
      .eq("endpoint", data.endpoint)
      .maybeSingle();
    if (!sub) return { ok: false, erro: "aparelho não encontrado", status: 0 };

    // Rate limit: 1 teste a cada 20 segundos por aparelho.
    if (sub.last_test_at && Date.now() - new Date(sub.last_test_at).getTime() < 20_000) {
      return { ok: false, erro: "Aguarde alguns segundos antes de testar de novo.", status: 429 };
    }

    const { despachar } = await import("@/lib/chat/push.server");
    const r = await despachar(sub as never, {
      title: "Notificações ativadas",
      body: "Você receberá um aviso quando chegar uma nova mensagem.",
      url: "/chat/inbox",
      tag: "teste-push",
      unreadCount: 1,
    });
    await context.supabase
      .from("wa_chat_push_subs")
      .update({ last_test_at: new Date().toISOString() })
      .eq("id", sub.id);
    return { ok: r.ok, erro: r.erro ?? null, status: r.status };
  });
