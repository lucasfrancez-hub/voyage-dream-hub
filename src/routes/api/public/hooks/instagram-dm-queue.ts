import { createFileRoute } from "@tanstack/react-router";

/**
 * Fila do direct do Instagram.
 *
 * Quando alguém comenta numa publicação, a resposta pública sai em ~20-35s e o
 * direct logo depois (~30-50s) — rápido, mas sem parecer robô respondendo no
 * mesmo segundo. Este cron roda a cada 15s e envia o que já venceu.
 */

export const Route = createFileRoute("/api/public/hooks/instagram-dm-queue")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Respostas públicas agendadas (~1 min após o comentário).
        let respostas = 0;
        const { data: aResponder } = await supabaseAdmin
          .from("instagram_comments")
          .select("id, comment_id, account_id, media_id, auto_reply_text, dm_text")
          .eq("auto_reply_status", "scheduled")
          .not("reply_scheduled_at", "is", null)
          .lte("reply_scheduled_at", new Date().toISOString())
          .limit(20);

        const { pausedMediaIds } = await import("@/lib/instagram/comment-pause.server");
        const pausadas = await pausedMediaIds([
          ...(aResponder ?? []).map((c) => c.media_id as string),
        ]);

        for (const c of aResponder ?? []) {
          // IA pausada nessa publicação: nada sai automático.
          if (pausadas.has(c.media_id as string)) continue;
          try {
            if (!c.auto_reply_text) throw new Error("sem texto de resposta");
            const { data: acc } = await supabaseAdmin
              .from("instagram_accounts")
              .select("ig_user_id, access_token")
              .eq("id", c.account_id)
              .maybeSingle();
            if (!acc?.access_token) throw new Error("conta sem token");

            const { replyToComment } = await import("@/lib/instagram/api.server");
            await replyToComment({
              commentId: c.comment_id,
              token: acc.access_token,
              message: c.auto_reply_text,
            });

            const espera = 30_000 + Math.floor(Math.random() * 20_000);
            await supabaseAdmin
              .from("instagram_comments")
              .update({
                auto_reply_status: "sent",
                auto_replied_at: new Date().toISOString(),
                read_at: new Date().toISOString(),
                reply_scheduled_at: null,
                dm_scheduled_at: c.dm_text ? new Date(Date.now() + espera).toISOString() : null,
              })
              .eq("id", c.id);
            respostas++;
          } catch (e) {
            console.error("[instagram-dm-queue] resposta pública falhou:", (e as Error).message);
            await supabaseAdmin
              .from("instagram_comments")
              .update({ reply_scheduled_at: new Date(Date.now() + 60_000).toISOString() })
              .eq("id", c.id);
          }
        }


        const { data: pendentes, error } = await supabaseAdmin
          .from("instagram_comments")
          .select("id, comment_id, account_id, media_id, dm_text")
          .not("dm_scheduled_at", "is", null)
          .is("auto_dm_sent_at", null)
          .lte("dm_scheduled_at", new Date().toISOString())
          .limit(20);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const pausadasDm = await pausedMediaIds([...(pendentes ?? []).map((c) => c.media_id as string)]);
        let enviados = 0;
        for (const c of pendentes ?? []) {
          if (pausadasDm.has(c.media_id as string)) continue;
          if (!c.dm_text) {
            await supabaseAdmin
              .from("instagram_comments")
              .update({ dm_scheduled_at: null })
              .eq("id", c.id);
            continue;
          }
          try {
            const { data: acc } = await supabaseAdmin
              .from("instagram_accounts")
              .select("ig_user_id, access_token")
              .eq("id", c.account_id)
              .maybeSingle();
            if (!acc?.access_token) throw new Error("conta sem token");

            const { sendPrivateReplyToComment } = await import("@/lib/instagram/api.server");
            await sendPrivateReplyToComment({
              igUserId: acc.ig_user_id,
              token: acc.access_token,
              commentId: c.comment_id,
              text: c.dm_text,
            });

            await supabaseAdmin
              .from("instagram_comments")
              .update({ auto_dm_sent_at: new Date().toISOString(), dm_scheduled_at: null })
              .eq("id", c.id);
            enviados++;
          } catch (e) {
            console.error("[instagram-dm-queue] falhou:", (e as Error).message);
            // tenta de novo no próximo minuto, até 10 min depois do previsto
            await supabaseAdmin
              .from("instagram_comments")
              .update({ dm_scheduled_at: new Date(Date.now() + 60_000).toISOString() })
              .eq("id", c.id);
          }
        }

        return new Response(JSON.stringify({ pendentes: pendentes?.length ?? 0, enviados, respostas }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
