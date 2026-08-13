import { createFileRoute } from "@tanstack/react-router";

/**
 * Dispatcher das publicações agendadas (WhatsApp / Instagram).
 * Rodar via pg_cron a cada 1 minuto.
 * Ao publicar com sucesso, a promoção vinculada vira status "publicado".
 */
export const Route = createFileRoute("/api/public/hooks/social-schedule-dispatch")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const nowIso = new Date().toISOString();
        const janelaIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: pendentes } = await supabaseAdmin
          .from("social_scheduled_posts")
          .select("id, channel, payload, promo_id")
          .eq("status", "agendado")
          .lte("scheduled_at", nowIso)
          .gte("scheduled_at", janelaIso)
          .order("scheduled_at", { ascending: true })
          .limit(5);

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];

        for (const post of pendentes ?? []) {
          const { data: travou } = await supabaseAdmin
            .from("social_scheduled_posts")
            .update({ status: "enviando" })
            .eq("id", post.id)
            .eq("status", "agendado")
            .select("id")
            .maybeSingle();
          if (!travou) continue;

          try {
            const payload = (post.payload ?? {}) as Record<string, unknown>;
            if (post.channel === "instagram") {
              const { publishInstagramMedia } = await import("@/lib/instagram/publish.server");
              const mediaType = String(payload.media_type ?? "feed_image") as "feed_image" | "story_image";
              await publishInstagramMedia({
                accountId: String(payload.account_id),
                mediaType,
                imageUrls: [String(payload.media_url)],
                caption: mediaType === "story_image" ? undefined : (payload.caption as string | undefined) ?? undefined,
                packageId: null,
              });
            } else {
              const { sendBroadcastBlock } = await import("@/lib/broadcast/sync.server");
              const ids = (payload.destino_ids as string[]) ?? [];
              const texto = String(payload.texto ?? "").trim();
              const imagemUrl = (payload.imagem_url as string | null) ?? null;
              const { data: destinos } = await supabaseAdmin
                .from("wa_broadcast_destinos")
                .select("id, nome, jid, tipo")
                .in("id", ids);
              const falhas: string[] = [];
              for (const d of destinos ?? []) {
                const isCanal = d.tipo === "channel";
                const r = await sendBroadcastBlock(
                  d.jid,
                  imagemUrl && !isCanal
                    ? { tipo: "image", midia_url: imagemUrl, midia_filename: "promocao.jpg", midia_caption: texto }
                    : { tipo: "text", texto },
                );
                if (!r.id) falhas.push(`${d.nome ?? d.jid}: ${r.error ?? "falhou"}`);
                await new Promise((res) => setTimeout(res, 800));
              }
              if (falhas.length && falhas.length === (destinos ?? []).length) {
                throw new Error(falhas.join(" | "));
              }
            }

            await supabaseAdmin
              .from("social_scheduled_posts")
              .update({ status: "publicado", published_at: new Date().toISOString(), error: null })
              .eq("id", post.id);

            if (post.promo_id) {
              await supabaseAdmin
                .from("airfare_promotions")
                .update({ status: "publicado" })
                .eq("id", post.promo_id);
            }
            results.push({ id: post.id, ok: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await supabaseAdmin
              .from("social_scheduled_posts")
              .update({ status: "falhou", error: msg })
              .eq("id", post.id);
            results.push({ id: post.id, ok: false, error: msg });
          }
        }

        return Response.json({ processados: results.length, results });
      },
    },
  },
});
