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

const MARCA_FECHO = "essas são as melhores opções que encontrei";
const MARCA_FALHA = "instabilidade no sistema de tarifas";

export const Route = createFileRoute("/api/public/hooks/flight-quote-watchdog")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recordHandoff, saveAndSendText } = await import(
          "@/lib/whatsapp/conversation.server"
        );
        const { firstName } = await import("@/lib/whatsapp/text-utils.server");

        /**
         * Salva + envia com trava anti-duplicidade (ver saveAndSendText).
         */
        const saveAndSend = async (convId: string, phone: string, texto: string) => {
          await saveAndSendText(convId, phone, texto);
        };


        const now = Date.now();
        const since = new Date(now - 60 * 60 * 1000).toISOString();

        // ---- ENTREGA GARANTIDA (roda ANTES de qualquer outra regra) --------
        // Antes, a entrega das artes pendentes só acontecia quando existia uma
        // "promessa" ("deixa eu pesquisar...") ainda em aberto na conversa. Se
        // a cotação travava sem essa frase, nada destravava — e a arte só saía
        // quando o cliente mandava mensagem nova (o webhook reprocessava).
        // Agora a fila é lida direto das cotações: qualquer cotação incompleta
        // (ou com claim preso porque o worker caiu no meio do render) é
        // retomada em no máximo 1 minuto, sem depender do cliente escrever.
        const destravadas: string[] = [];
        try {
          const { data: pendentes } = await supabaseAdmin
            .from("wa_flight_quotes")
            .select("conversation_id, protocolo_id, cards_sent_at, cancelled_at, created_at")
            .gte("created_at", since)
            .is("cancelled_at", null)
            .order("created_at", { ascending: true })
            .limit(100);

          const CLAIM_TRAVADO_MS = 45_000;
          const convsPendentes = new Map<string, string | null>();
          for (const q of (pendentes ?? []) as Array<{
            conversation_id: string;
            protocolo_id: string | null;
            cards_sent_at: string | null;
          }>) {
            const claimPreso =
              !!q.cards_sent_at && now - new Date(q.cards_sent_at).getTime() > CLAIM_TRAVADO_MS;
            if (q.cards_sent_at && !claimPreso) continue;
            if (!convsPendentes.has(q.conversation_id)) {
              convsPendentes.set(q.conversation_id, q.protocolo_id);
            }
          }

          if (convsPendentes.size) {
            const { sendPendingFlightCards } = await import(
              "@/lib/whatsapp/flight-cards-pending.server"
            );
            for (const [convId, protoId] of convsPendentes) {
              const { data: c } = await supabaseAdmin
                .from("wa_conversations")
                .select("id, wa_phone, mode, ai_paused, protocolo_ativo_id")
                .eq("id", convId)
                .maybeSingle();
              if (!c || c.mode !== "ai" || c.ai_paused) continue;
              if (protoId && c.protocolo_ativo_id !== protoId) continue;

              let abertoEm: string | null = null;
              if (protoId) {
                const { data: p } = await supabaseAdmin
                  .from("wa_protocolos")
                  .select("status, opened_at, created_at")
                  .eq("id", protoId)
                  .maybeSingle();
                if (!p || p.status !== "aberto") continue;
                abertoEm = ((p.opened_at ?? p.created_at) as string | null) ?? null;
              }

              const r = await sendPendingFlightCards(
                convId,
                c.wa_phone as string,
                60 * 60 * 1000,
                abertoEm,
                protoId ?? null,
              ).catch((e) => {
                console.warn("[watchdog] falha ao retomar cotação:", (e as Error)?.message ?? e);
                return { sent: 0 };
              });
              if (r.sent > 0) destravadas.push(convId);
              console.log(
                JSON.stringify({
                  event: "flight_watchdog_resume",
                  conversation_id: convId,
                  protocolo_id: protoId,
                  sent: r.sent,
                  at: new Date().toISOString(),
                }),
              );
            }
          }
        } catch (e) {
          console.warn("[watchdog] varredura de cotações falhou:", (e as Error)?.message ?? e);
        }



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

        for (const [convId, msgsAll] of byConv) {
          const { data: conv } = await supabaseAdmin
            .from("wa_conversations")
            .select("id, wa_phone, display_name, mode, ai_paused, tags, protocolo_ativo_id")
            .eq("id", convId)
            .maybeSingle();
          if (!conv || conv.mode !== "ai" || conv.ai_paused) continue;

          // Protocolo encerrado = ponto final. Nada de robô continuando busca
          // de um atendimento já fechado (ou de um protocolo anterior).
          if (!conv.protocolo_ativo_id) continue;
          const { data: proto } = await supabaseAdmin
            .from("wa_protocolos")
            .select("id, status, opened_at, created_at")
            .eq("id", conv.protocolo_ativo_id as string)
            .maybeSingle();
          if (!proto || proto.status !== "aberto") continue;

          // Só olha o que aconteceu DENTRO do protocolo aberto atual.
          const inicio = (proto.opened_at ?? proto.created_at) as string | null;
          const msgs = inicio ? msgsAll.filter((m) => m.created_at >= inicio) : msgsAll;
          if (!msgs.length) continue;

          // Primeira promessa ainda não resolvida. Usar a última fazia uma nova
          // desculpa ("vou verificar") zerar o relógio e travar o atendimento.
          let promessa: Row | null = null;
          for (const m of msgs) {
            if (m.direction === "outbound" && m.sender !== "system" && PROMESSA.test(m.content ?? "")) {
              promessa = m;
              break;
            }
          }
          if (!promessa) continue;

          const depois = msgs.filter((m) => m.created_at > promessa!.created_at);

          // ETAPA DE ENTREGA: toda rodada tenta mandar a PRÓXIMA arte pendente
          // (uma por rodada). É o motor do processo em passos: pesquisou →
          // primeira arte → segunda arte → fecho.
          const nome = firstName(conv.display_name as string | null);
          const voc = nome ? `${nome}, ` : "";
          const { sendPendingFlightCards } = await import("@/lib/whatsapp/flight-cards-pending.server");
          const pend = await sendPendingFlightCards(
            convId,
            conv.wa_phone as string,
            60 * 60 * 1000,
            inicio,
            proto.id as string,
          ).catch(() => ({ sent: 0, done: false }) as { sent: number; done?: boolean });
          if (pend.sent > 0) {
            avisados.push(convId);
            continue;
          }

          // Só considera entregue quando existe uma arte registrada. Texto como
          // "achei opções" não pode impedir o reenvio dos cards pendentes.
          const cards = depois.filter(
            (m) =>
              m.direction === "outbound" &&
              m.sender !== "system" &&
              /\[\[media:image/i.test(m.content ?? ""),
          );
          if (cards.length) {
            // Entrega concluída: fecha puxando a venda, uma vez só e sempre
            // com texto variado (ver fecho-cotacao.ts).
            const { montarFecho, FECHO_RE } = await import("@/lib/whatsapp/fecho-cotacao");
            const jaFechou = depois.some(
              (m) => (m.content ?? "").includes(MARCA_FECHO) || FECHO_RE.test(m.content ?? ""),
            );
            const ultimoCard = new Date(cards[cards.length - 1].created_at).getTime();
            const espera = cards.length >= 2 ? 60_000 : 180_000;
            if (!jaFechou && now - ultimoCard > espera) {
              for (const balao of montarFecho(nome, cards.length)) {
                await saveAndSend(convId, conv.wa_phone as string, balao);
              }
              avisados.push(convId);
            }

            continue;
          }

          // protocolo encerrado depois da promessa (mensagem de sistema) → para
          const encerrou = depois.some((m) => /protocolo\s+\S+\s+foi encerrado/i.test(m.content ?? ""));
          if (encerrou) continue;

          // Se JÁ saiu arte neste protocolo (mesmo antes desta promessa), nunca
          // mandar "a consulta tá demorando" — era a mensagem falsa de atraso.
          const cardsProtocolo = msgs.filter(
            (m) =>
              m.direction === "outbound" &&
              m.sender !== "system" &&
              /\[\[media:image/i.test(m.content ?? ""),
          );
          if (cardsProtocolo.length) continue;

          const jaFalhou = msgs.some((m) => (m.content ?? "").includes(MARCA_FALHA));
          if (jaFalhou) continue;

          const elapsedMin = (now - new Date(promessa.created_at).getTime()) / 60000;
          // Não existe mais aviso intermediário de "finalizando/demorando": ele
          // competia com a entrega em etapas e aparecia fora de ordem. Até 10
          // minutos, o watchdog apenas continua tentando entregar as artes.
          if (elapsedMin >= 10) {
            const texto =
              `${voc}tivemos uma ${MARCA_FALHA} agora e a busca não retornou\n\n` +
              `Pra não te deixar esperando, já passei sua solicitação pro nosso time comercial — um consultor te manda a cotação por aqui mesmo`;
            await saveAndSend(convId, conv.wa_phone as string, texto);


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

        return Response.json({ ok: true, avisados, escalados, destravadas });
      },
    },
  },
});
