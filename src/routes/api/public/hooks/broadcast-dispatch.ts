import { createFileRoute } from "@tanstack/react-router";

/**
 * Dispatcher do sistema de disparos em massa.
 *
 * Rodar via pg_cron a cada 1 minuto. Só executa entre 09:00 e 21:00 BRT.
 * Pega campanhas com status 'agendada' e scheduled_at <= now(),
 * marca como 'enviando', envia cada bloco para cada destino em série
 * (com espaçamento leve pra não flodar) e ao final marca 'concluida'.
 */
export const Route = createFileRoute("/api/public/hooks/broadcast-dispatch")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendBroadcastBlock } = await import("@/lib/broadcast/sync.server");

        // Janela comercial 09h-21h BRT
        const hourBRT = Number(
          new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()),
        );
        if (hourBRT < 9 || hourBRT >= 21) {
          return Response.json({ skipped: true, reason: "fora do horário comercial", hourBRT });
        }

        const nowIso = new Date().toISOString();
        const { data: pend } = await supabaseAdmin
          .from("wa_broadcast_campanhas")
          .select("id, destino_ids, nome")
          .eq("status", "agendada")
          .lte("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: true })
          .limit(3);

        const results: Array<{ id: string; ok: number; fail: number }> = [];

        for (const camp of pend ?? []) {
          await supabaseAdmin.from("wa_broadcast_campanhas").update({ status: "enviando" }).eq("id", camp.id);

          const { data: msgs } = await supabaseAdmin
            .from("wa_broadcast_mensagens")
            .select("*")
            .eq("campanha_id", camp.id)
            .order("ordem");
          const { data: destinos } = await supabaseAdmin
            .from("wa_broadcast_destinos")
            .select("id, jid, tipo")
            .in("id", camp.destino_ids as string[]);

          let ok = 0, fail = 0;
          const now = Date.now();
          // Mensagens com horário próprio no futuro ficam para a próxima rodada.
          const prontas = (msgs ?? []).filter((m) => !m.scheduled_at || new Date(m.scheduled_at).getTime() <= now);
          const pendentesFuturas = (msgs ?? []).filter((m) => m.scheduled_at && new Date(m.scheduled_at).getTime() > now);
          for (const d of destinos ?? []) {
            const ehInstagram = d.tipo.startsWith("instagram_");
            for (const m of prontas) {
              // Em canais o WhatsApp já gera preview da URL no texto — pular
              // blocos de imagem para não duplicar a arte.
              if (d.tipo === "channel" && (m.tipo === "image" || m.tipo === "video")) continue;
              // Instagram só publica blocos de mídia (imagem/vídeo) com URL.
              if (ehInstagram && m.tipo !== "image" && m.tipo !== "video") continue;
              if (d.tipo === "instagram_feed" && m.tipo !== "image") continue;
              if (d.tipo === "instagram_reels" && m.tipo !== "video") continue;


              // Idempotência: pula se já enviado (retry seguro)
              const { data: existente } = await supabaseAdmin
                .from("wa_broadcast_envios")
                .select("id,status")
                .eq("campanha_id", camp.id)
                .eq("destino_id", d.id)
                .eq("mensagem_id", m.id)
                .maybeSingle();
              if (existente && existente.status !== "pendente" && existente.status !== "falhou") continue;

              let r: { id: string | null; error?: string | null };
              if (ehInstagram) {
                const igUserId = d.jid.replace(/^ig_(story|feed|reels):/, "");
                const { data: acc } = await supabaseAdmin
                  .from("instagram_accounts")
                  .select("id")
                  .eq("ig_user_id", igUserId)
                  .maybeSingle();
                const ehVideo = m.tipo === "video";
                const mediaType =
                  d.tipo === "instagram_reels"
                    ? ("reels_video" as const)
                    : d.tipo === "instagram_feed"
                      ? ("feed_image" as const)
                      : ehVideo
                        ? ("story_video" as const)
                        : ("story_image" as const);
                if (!acc?.id || !m.midia_url) {
                  r = { id: null, error: "Instagram exige bloco de mídia com URL" };
                } else {
                  const { publishInstagramMedia } = await import("@/lib/instagram/publish.server");
                  try {
                    const legenda = m.midia_caption ?? m.texto ?? undefined;
                    const res = await publishInstagramMedia({
                      accountId: acc.id,
                      mediaType,
                      imageUrls: ehVideo ? [] : [m.midia_url],
                      videoUrl: ehVideo ? m.midia_url : undefined,
                      caption: mediaType === "story_image" || mediaType === "story_video" ? undefined : legenda,
                    });
                    r = { id: res.id ?? null, error: null };
                  } catch (e) {
                    r = { id: null, error: e instanceof Error ? e.message : "erro IG" };
                  }
                }
              } else {
                r = await sendBroadcastBlock(d.jid, {
                  tipo: m.tipo as "text" | "image" | "video" | "document" | "buttons",
                  texto: m.texto,
                  midia_url: m.midia_url,
                  midia_filename: m.midia_filename,
                  midia_caption: m.midia_caption,
                  botoes: m.botoes,
                });
              }



              const row = {
                campanha_id: camp.id,
                destino_id: d.id,
                mensagem_id: m.id,
                status: r.id ? "enviado" : "falhou",
                wa_message_id: r.id,
                error: r.error ?? null,
                sent_at: r.id ? new Date().toISOString() : null,
              };
              if (existente) {
                await supabaseAdmin.from("wa_broadcast_envios").update(row).eq("id", existente.id);
              } else {
                await supabaseAdmin.from("wa_broadcast_envios").insert(row);
              }
              if (r.id) ok++; else fail++;
              // pequena pausa entre envios
              await new Promise((res) => setTimeout(res, 400));
            }
          }

          // Métricas acumuladas (a campanha pode rodar em várias rodadas,
          // uma por horário de bloco) — contamos direto na tabela de envios.
          const { data: todosEnvios } = await supabaseAdmin
            .from("wa_broadcast_envios")
            .select("status")
            .eq("campanha_id", camp.id);
          const totalEnviados = (todosEnvios ?? []).filter((e) => e.status === "enviado").length;
          const totalFalhas = (todosEnvios ?? []).filter((e) => e.status === "falhou").length;

          if (pendentesFuturas.length > 0) {
            // Ainda há blocos com horário futuro: volta para 'agendada' apontando
            // para o próximo horário programado.
            const proximo = pendentesFuturas
              .map((m) => new Date(m.scheduled_at as string).getTime())
              .sort((a, b) => a - b)[0];
            await supabaseAdmin
              .from("wa_broadcast_campanhas")
              .update({
                status: "agendada",
                scheduled_at: new Date(proximo).toISOString(),
                metrics: {
                  total: totalEnviados + totalFalhas,
                  enviados: totalEnviados,
                  falhas: totalFalhas,
                  restantes: pendentesFuturas.length * (destinos?.length ?? 0),
                },
              })
              .eq("id", camp.id);
          } else {
            const status = totalFalhas > 0 && totalEnviados === 0 ? "falhou" : "concluida";
            await supabaseAdmin
              .from("wa_broadcast_campanhas")
              .update({
                status,
                sent_at: new Date().toISOString(),
                metrics: { total: totalEnviados + totalFalhas, enviados: totalEnviados, falhas: totalFalhas },
              })
              .eq("id", camp.id);
          }



          results.push({ id: camp.id, ok, fail });
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
