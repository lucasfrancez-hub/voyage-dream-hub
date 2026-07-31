import { createFileRoute } from "@tanstack/react-router";

/**
 * Robô anti-travamento da cotação.
 *
 * Roda a cada 1 min via pg_cron. Procura conversas em que a IA prometeu
 * pesquisar ("deixa eu pesquisar aqui", "já vou verificar"...) e NÃO entregou
 * nada depois:
 *
 *   1) 5 min sem resposta  → balão pedindo mais um instante ("tô replicando aqui")
 *   2) 10 min sem resposta → avisa instabilidade sistêmica e passa pro comercial
 *      (tag aguardando_humano + handoff no painel)
 *
 * Idempotente: os balões são identificados por marcadores no conteúdo, então
 * cada estágio só dispara uma vez por promessa.
 */

const PROMESSA =
  /(deixa? eu (pesquisar|ver|dar uma olhada|verificar)|vou (pesquisar|verificar|buscar|dar uma olhada|consultar)|estou (pesquisando|verificando|buscando|consultando)|to (pesquisando|verificando|buscando)|um (instante|minutinho|momento)|já te trago|já volto com)/i;

const MARCA_AVISO = "tô finalizando a busca aqui";
const MARCA_FALHA = "instabilidade no sistema de tarifas";

export const Route = createFileRoute("/api/public/hooks/flight-quote-watchdog")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { saveMessage, recordHandoff } = await import("@/lib/whatsapp/conversation.server");
        const { sendWhatsAppBubbles } = await import("@/lib/whatsapp/send.server");
        const { firstName } = await import("@/lib/whatsapp/text-utils.server");

        const now = Date.now();
        const since = new Date(now - 60 * 60 * 1000).toISOString();

        const { data: rows } = await supabaseAdmin
          .from("wa_messages")
          .select("id, conversation_id, sender, direction, content, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: true });

        type Row = {
          id: string;
          conversation_id: string;
          sender: string;
          direction: string;
          content: string | null;
          created_at: string;
        };
        const all = (rows ?? []) as Row[];

        // agrupa por conversa
        const byConv = new Map<string, Row[]>();
        for (const r of all) {
          const list = byConv.get(r.conversation_id) ?? [];
          list.push(r);
          byConv.set(r.conversation_id, list);
        }

        const avisados: string[] = [];
        const escalados: string[] = [];

        for (const [convId, msgs] of byConv) {
          // última promessa de pesquisa feita pela IA
          let promessa: Row | null = null;
          for (const m of msgs) {
            if (m.direction === "outbound" && m.sender !== "system" && PROMESSA.test(m.content ?? "")) {
              promessa = m;
            }
          }
          if (!promessa) continue;

          const depois = msgs.filter((m) => m.created_at > promessa!.created_at);

          // entregou alguma coisa? (arte de voo, opções em texto, valores)
          const entregou = depois.some(
            (m) =>
              m.direction === "outbound" &&
              m.sender !== "system" &&
              /(opção|opcao|R\$|https?:\/\/\S+\.(png|jpg|jpeg)|\bida:|\bvolta:)/i.test(m.content ?? ""),
          );
          if (entregou) continue;

          const jaAvisou = depois.some((m) => (m.content ?? "").includes(MARCA_AVISO));
          const jaFalhou = depois.some((m) => (m.content ?? "").includes(MARCA_FALHA));
          if (jaFalhou) continue;

          const elapsedMin = (now - new Date(promessa.created_at).getTime()) / 60000;
          if (elapsedMin < 5) continue;

          const { data: conv } = await supabaseAdmin
            .from("wa_conversations")
            .select("id, wa_phone, display_name, mode, ai_paused, tags, protocolo_ativo_id")
            .eq("id", convId)
            .maybeSingle();
          if (!conv || conv.mode !== "ai" || conv.ai_paused) continue;

          const nome = firstName(conv.display_name as string | null);
          const voc = nome ? `${nome}, ` : "";

          if (!jaAvisou) {
            const texto =
              `${voc}${MARCA_AVISO}\n\n` +
              `A consulta com as companhias tá demorando um pouquinho mais que o normal, mas já já te mando as opções`;
            await saveMessage({
              conversation_id: convId,
              direction: "outbound",
              sender: "camila",
              content: texto,
            });
            await sendWhatsAppBubbles(conv.wa_phone as string, texto);
            avisados.push(convId);
            continue;
          }

          if (elapsedMin >= 10) {
            const texto =
              `${voc}tivemos uma ${MARCA_FALHA} agora e a busca não retornou\n\n` +
              `Pra não te deixar esperando, já passei sua solicitação pro nosso time comercial — um consultor te manda a cotação por aqui mesmo`;
            await saveMessage({
              conversation_id: convId,
              direction: "outbound",
              sender: "camila",
              content: texto,
            });
            await sendWhatsAppBubbles(conv.wa_phone as string, texto);

            const tags = Array.from(
              new Set([...((conv.tags as string[] | null) ?? []), "nova_cotacao", "aguardando_humano"]),
            );
            await supabaseAdmin
              .from("wa_conversations")
              .update({ tags, priority: "high", assigned_to: null })
              .eq("id", convId);

            const briefing =
              "⚠️ Cotação ao vivo travou (instabilidade). Cliente aguarda cotação — enviar manualmente.";
            if (conv.protocolo_ativo_id) {
              await supabaseAdmin
                .from("wa_protocolos")
                .update({ assunto_resumo: briefing })
                .eq("id", conv.protocolo_ativo_id as string);
            }
            await recordHandoff({
              conversation_id: convId,
              from_mode: "ai",
              to_mode: "ai",
              reason: "aguardando_humano:nova_cotacao",
              briefing,
            });
            escalados.push(convId);
          }
        }

        return Response.json({ ok: true, avisados, escalados });
      },
    },
  },
});
