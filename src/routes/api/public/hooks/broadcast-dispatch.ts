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
          for (const d of destinos ?? []) {
            for (const m of msgs ?? []) {
              // Em canais o WhatsApp já gera preview da URL no texto — pular
              // blocos de imagem para não duplicar a arte.
              if (d.tipo === "channel" && (m.tipo === "image" || m.tipo === "video")) continue;
              // Story do Instagram só aceita bloco de imagem ou vídeo com URL.
              if (d.tipo === "instagram_story" && m.tipo !== "image") continue;

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
              if (d.tipo === "instagram_story") {
                const igUserId = d.jid.replace(/^ig_story:/, "");
                const { data: acc } = await supabaseAdmin
                  .from("instagram_accounts")
                  .select("id")
                  .eq("ig_user_id", igUserId)
                  .maybeSingle();
                if (!acc?.id || !m.midia_url || m.tipo !== "image") {
                  r = { id: null, error: "Story exige bloco de imagem com URL" };
                } else {
                  const { publishInstagramMedia } = await import("@/lib/instagram/publish.server");
                  try {
                    const res = await publishInstagramMedia({
                      accountId: acc.id,
                      mediaType: "story_image",
                      imageUrls: [m.midia_url],
                      caption: m.texto ?? undefined,
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

          const status = fail > 0 && ok === 0 ? "falhou" : "concluida";
          await supabaseAdmin
            .from("wa_broadcast_campanhas")
            .update({
              status,
              sent_at: new Date().toISOString(),
              metrics: { total: ok + fail, enviados: ok, falhas: fail },
            })
            .eq("id", camp.id);

          results.push({ id: camp.id, ok, fail });
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
