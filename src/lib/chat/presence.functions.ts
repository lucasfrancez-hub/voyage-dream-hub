/**
 * Presença do atendente: qual conversa ele está olhando agora.
 * Serve para NÃO mandar push de uma conversa que já está aberta na tela.
 * Heartbeat curto (expira em 60s) para não depender do app avisar que fechou.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const pingPresencaChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversationId: z.string().uuid().nullable().optional(),
        visivel: z.boolean().default(true),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.from("wa_agent_presence").upsert(
      {
        user_id: context.userId,
        conversation_id: data.conversationId ?? null,
        visivel: data.visivel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    return { ok: true };
  });
