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
        // A fila é lida do ESTADO das cotações (delivery_status != completed,
        // não cancelada, entregues < previstas) pela MESMA função central que o
        // worker usa. Não depende de mensagem do cliente, de promessa na
        // conversa nem de resposta da IA. Claim preso (worker morreu no render)
        // expira em 45s e a opção volta pra fila automaticamente.
        const destravadas: string[] = [];
        let reconciliadas: unknown = null;
        try {
          // 0) Envio abortado no meio (worker morreu no upload da arte): o
          //    balão fica "não entregue" pra sempre e trava o reenvio. Some
          //    com a linha presa e devolve a opção pra fila.
          const { sweepEnviosInterrompidos } = await import(
            "@/lib/whatsapp/envio-interrompido.server"
          );
          await sweepEnviosInterrompidos();
        } catch (e) {
          console.warn("[watchdog] varredura de envios presos falhou:", (e as Error)?.message ?? e);
        }
        let turnos: unknown = null;
        try {
          // 0.5) Turno travado: cliente respondeu e nada saiu. Reexecuta pelo
          //      estado persistido e, se insistir em travar, passa pra humano
          //      com o contexto completo da cotação.
          const { reconcilePendingAgentTurns } = await import(
            "@/lib/whatsapp/flight-turn-reconcile.server"
          );
          turnos = await reconcilePendingAgentTurns();
        } catch (e) {
          console.warn("[watchdog] reconciliação de turnos falhou:", (e as Error)?.message ?? e);
        }
        try {
          // 1) Autocorreção: olha o estado, descobre o que faltou (claim órfão,
          //    card gerado sem envio, envio sem baixa no banco, rodada não
          //    encadeada, contador errado) e executa o próximo passo.
          const { reconcileFlightDeliveries } = await import(
            "@/lib/whatsapp/flight-reconcile.server"
          );
          reconciliadas = await reconcileFlightDeliveries();
        } catch (e) {
          console.warn("[watchdog] reconciliação falhou:", (e as Error)?.message ?? e);
        }
        try {
          // 2) Fila normal das cotações que já estão consistentes.
          const { sweepFlightQuoteDeliveries } = await import(
            "@/lib/whatsapp/flight-delivery.server"
          );
          const r = await sweepFlightQuoteDeliveries();
          if (r.entregues > 0) destravadas.push(`${r.entregues}/${r.cotacoes}`);
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

          // A entrega das opções já foi feita pela varredura central lá em cima
          // (processNextFlightQuoteOption). Aqui o watchdog cuida só do fecho e
          // do plano B quando a pesquisa não retornou nada.
          const nome = firstName(conv.display_name as string | null);
          const voc = nome ? `${nome}, ` : "";


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

        return Response.json({ ok: true, avisados, escalados, destravadas, reconciliadas });
      },
    },
  },
});
