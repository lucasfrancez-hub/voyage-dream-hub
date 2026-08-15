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
          .select("id, conversation_id, sender, direction, content, created_at, quote_id, option_index")
          .gte("created_at", since)
          .order("created_at", { ascending: true });

        type Row = {
          id: string;
          conversation_id: string;
          sender: string;
          direction: string;
          content: string | null;
          created_at: string;
          quote_id?: string | null;
          option_index?: number | null;
        };

        /**
         * Entrega da cotação hoje é TEXTO + LINK do orçamento público (as artes
         * foram desativadas). Então qualquer balão do agente amarrado a uma
         * cotação (quote_id/option_index) ou contendo o link do orçamento conta
         * como entrega — não só `[[media:image]]`.
         */
        const LINK_COTACAO = /(\/orcamento\/|orcamento\.|\/o\/|\[\[media:image)/i;
        const ehEntrega = (m: Row) =>
          m.direction === "outbound" &&
          m.sender !== "system" &&
          (!!m.quote_id || typeof m.option_index === "number" || LINK_COTACAO.test(m.content ?? ""));
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

          // Uma promessa só pertence ao turno que a originou. Se o cliente já
          // mandou outra mensagem depois dela (ex.: saiu de aéreo e pediu
          // pacote), a promessa antiga não pode disparar instabilidade no novo
          // assunto.
          const ultimaEntrada = [...msgs]
            .reverse()
            .find((m) => m.direction === "inbound");
          const msgsDoTurno = ultimaEntrada
            ? msgs.filter((m) => m.created_at >= ultimaEntrada.created_at)
            : msgs;

          // Primeira promessa ainda não resolvida dentro do turno atual. Usar
          // a última fazia uma nova desculpa zerar o relógio.
          let promessa: Row | null = null;
          for (const m of msgsDoTurno) {
            if (m.direction === "outbound" && m.sender !== "system" && PROMESSA.test(m.content ?? "")) {
              promessa = m;
              break;
            }
          }
          if (!promessa) continue;

          const depois = msgs.filter((m) => m.created_at > promessa!.created_at);

          // A entrega oficial pode ser texto + link, não apenas uma arte. O
          // estado da cotação é a fonte de verdade: uma cotação concluída neste
          // protocolo encerra a vigilância dessa promessa.
          const { data: cotacaoConcluida } = await supabaseAdmin
            .from("wa_flight_quotes")
            .select("id")
            .eq("conversation_id", convId)
            .eq("protocolo_id", conv.protocolo_ativo_id as string)
            .eq("delivery_status", "completed")
            .limit(1);
          if ((cotacaoConcluida ?? []).length) continue;

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
            // Entrega concluída. Nada de fecho automático: a conversa segue
            // dinâmica com o próprio agente (sem pressão comercial).
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
            // VÁLVULA DE SEGURANÇA: pesquisa sem progresso real por 10 min.
            // Uma mensagem só, IA pausada, jobs/retries/follow-ups cancelados
            // e briefing completo pro Comercial. Proibido loop de recuperação.
            const { transferirPorInstabilidade } = await import(
              "@/lib/whatsapp/transferencia-instabilidade.server"
            );
            const r = await transferirPorInstabilidade({
              conversation_id: convId,
              protocol_id: (conv.protocolo_ativo_id as string | null) ?? null,
              motivo: "pesquisa_sem_progresso",
              detalhe: `promessa de pesquisa sem entrega há ${Math.round(elapsedMin)} min`,
            });
            if (!r.transferido) continue;
            escalados.push(convId);
          }
        }

        return Response.json({ ok: true, avisados, escalados, destravadas, reconciliadas, turnos });
      },
    },
  },
});
