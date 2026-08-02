/**
 * CENTRAL DE ESPECIALISTAS — camada de atendimento que opera os motores de
 * busca (1ª fase: PASSAGENS AÉREAS via Comprar Viagem / OnerTravel).
 *
 * Regras de ouro:
 * - Não altera nada das IAs consultoras (Camila, Roberto, Nath, ...).
 * - Reutiliza integralmente o motor já existente (src/lib/onertravel.server.ts)
 *   e os CARDS (artes) do WhatsApp já usados pelo aéreo.
 * - Personalidade IDÊNTICA à das consultoras: usa o mesmo prompt compartilhado.
 * - Arquitetura preparada para hotéis, carros, aéreo+hotel, seguro e cruzeiros
 *   (ver CENTRAL_MODULES abaixo) — porém só o módulo "aereo" está habilitado.
 *
 * SERVER-ONLY.
 */
import { tool } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordHandoff, type WaConversation } from "./conversation.server";
import { validateFlightSearch } from "./flight-search-validation";
import { VIA_AIR_CNPJ, VIA_AIR_EMAIL_EMERGENCIA } from "@/lib/institucional";

import type { PeriodoDia } from "./flight-quote.server";

/* ─────────────────────────────────────────────────────────────
   Módulos da Central (expansão futura)
   ───────────────────────────────────────────────────────────── */
export type CentralModule =
  | "aereo"
  | "hotel"
  | "carro"
  | "aereo_hotel"
  | "seguro"
  | "cruzeiro";

/** 1ª fase: somente passagens aéreas. Os demais ficam desabilitados. */
export const CENTRAL_MODULES: Record<CentralModule, boolean> = {
  aereo: true,
  hotel: false,
  carro: false,
  aereo_hotel: false,
  seguro: false,
  cruzeiro: false,
};

export const CENTRAL_SLUGS = ["paula", "bruno"] as const;
export type CentralSlug = (typeof CENTRAL_SLUGS)[number];

export const CENTRAL_GENDER: Record<CentralSlug, "f" | "m"> = {
  paula: "f",
  bruno: "m",
};

/** Frase padrão de falha técnica — nunca expor erro real ao cliente. */
export const CENTRAL_FALHA_MSG =
  "Estou com um probleminha no meu sistema para concluir essa pesquisa, mas já encaminhei seu atendimento para o nosso time Comercial. Eles vão continuar a pesquisa e verificar as melhores opções para você.";

/* ─────────────────────────────────────────────────────────────
   Modelo de contingência em texto (mesmos dados estruturados do card)
   ───────────────────────────────────────────────────────────── */
import { formatOptionText, formatOptionsText } from "./flight-option-text.server";
export { formatOptionText, formatOptionsText };

/* ─────────────────────────────────────────────────────────────
   Escalação automática pro Comercial quando o motor falha
   ───────────────────────────────────────────────────────────── */
async function escalarPorFalha(conversation: WaConversation, briefing: string) {
  const tags = Array.from(
    new Set([...(conversation.tags ?? []), "nova_cotacao", "aguardando_humano", "falha_central"]),
  );
  await supabaseAdmin
    .from("wa_conversations")
    .update({
      tags,
      assigned_to: null,
      priority: "high",
      // sai da Central: se o cliente voltar a falar, quem atende é o consultor
      central_slug: null,
      central_busca: null,
    })
    .eq("id", conversation.id);
  if (conversation.protocolo_ativo_id) {
    await supabaseAdmin
      .from("wa_protocolos")
      .update({ assunto_resumo: briefing })
      .eq("id", conversation.protocolo_ativo_id);
  }
  await recordHandoff({
    conversation_id: conversation.id,
    from_mode: "ai",
    to_mode: "ai",
    reason: "aguardando_humano:falha_central_especialistas",
    briefing,
  }).catch(() => {});
}

/**
 * Encaminha o atendimento ao time Comercial (fila humana) quando o assunto
 * não é passagem aérea avulsa. A Central NÃO devolve para as IAs consultoras.
 */
async function encaminharParaComercial(conversation: WaConversation, briefing: string) {
  await escalarPorFalha(conversation, briefing);
}



/* ─────────────────────────────────────────────────────────────
   Tools da Central
   ───────────────────────────────────────────────────────────── */
/** Ferramentas que a Central pode expor (espelhado em ai_agents.tools_habilitadas). */
export const CENTRAL_TOOL_SLUGS = ["pesquisar_passagens", "encaminhar_para_comercial"] as const;

/**
 * Monta as tools da Central. Quando o agente tem `tools_habilitadas`
 * preenchido no cadastro (/chat/agentes), só entram as tools listadas lá —
 * assim a configuração do banco é a fonte de verdade. Lista vazia = todas.
 *
 * `agente` fica gravado na cotação: se foi o Bruno que pesquisou, TODAS as
 * artes daquela cotação (inclusive as que o watchdog dispara depois) precisam
 * continuar aparecendo como enviadas pelo Bruno.
 */
export function buildCentralTools(
  conversation: WaConversation,
  habilitadas?: string[] | null,
  agente?: { slug: string; nome: string } | null,
) {
  const permitidas = (habilitadas ?? []).filter((t) =>
    (CENTRAL_TOOL_SLUGS as readonly string[]).includes(t),
  );
  const todas = {


    pesquisar_passagens: tool({
      description:
        "Pesquisa passagens aéreas no motor de busca oficial (Comprar Viagem) e ENVIA automaticamente as ARTES (cards) das duas melhores opções ao cliente. Use SOMENTE quando o próprio cliente já tiver informado origem, destino, tipo de trecho (somente ida ou ida e volta), data(s) e quantidade de passageiros. NUNCA chame com data, trecho ou quantidade de passageiros presumidos por você. Se algum dado faltar ou estiver incoerente, a tool devolve o que perguntar em vez de pesquisar. Se o cliente pedir outro horário depois, chame de novo com a preferência de horário.",
      inputSchema: z.object({
        origem: z.string().min(2).describe("Cidade ou IATA de origem, ex.: 'Maringá' ou 'MGF'"),
        destino: z.string().min(2).describe("Cidade ou IATA de destino, ex.: 'Recife' ou 'REC'"),
        tipo_trecho: z
          .enum(["somente_ida", "ida_e_volta"])
          .describe(
            "Campo OBRIGATÓRIO e explícito: só preencha com o que o cliente disse. Nunca deduza pelo fato de existir ou não uma data de volta.",
          ),
        data_ida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data de ida AAAA-MM-DD, exatamente como o cliente informou (nunca estimada)"),
        data_volta: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .describe("Data de volta AAAA-MM-DD. Obrigatória quando tipo_trecho = ida_e_volta; null em somente_ida"),
        data_informada_pelo_cliente: z
          .boolean()
          .describe(
            "true SOMENTE se o cliente informou a data de ida (mesmo em linguagem natural, ex.: 'dia 15 de setembro'). Se você estiver assumindo/estimando a data, mande false — a pesquisa não será feita.",
          ),
        adultos: z.number().int().min(1).max(9),
        pax_informado_pelo_cliente: z
          .boolean()
          .describe("true somente se o cliente informou quantos passageiros vão viajar"),
        criancas: z.number().int().min(0).max(9).nullable().describe("Crianças de 2 a 11 anos"),
        bebes: z.number().int().min(0).max(9).nullable().describe("Bebês de colo (menos de 2 anos)"),
        preferencia_horario_ida: z
          .enum(["madrugada", "manha", "tarde", "noite"])
          .nullable()
          .describe(
            "Preferência de horário SOMENTE da IDA. Só preencha se o cliente informou espontaneamente. Nunca copie a preferência da volta.",
          ),
        preferencia_horario_volta: z
          .enum(["madrugada", "manha", "tarde", "noite"])
          .nullable()
          .describe(
            "Preferência de horário SOMENTE da VOLTA. Só preencha se o cliente informou espontaneamente. Nunca repita aqui a preferência da ida.",
          ),
        somente_com_bagagem: z
          .boolean()
          .nullable()
          .describe("Só true se o cliente pediu bagagem despachada"),
        somente_voo_direto: z
          .boolean()
          .nullable()
          .describe(
            "true quando o cliente pediu voo direto / sem escala / sem conexão. O motor filtra de verdade — pode oferecer isso.",
          ),
        maximo_conexoes: z
          .number()
          .int()
          .min(0)
          .max(2)
          .nullable()
          .describe(
            "Teto de conexões por trecho quando o cliente limita ('no máximo uma conexão'). 0 = direto. Deixe null se ele não falou nada.",
          ),
        companhias_incluidas: z
          .array(z.string())
          .nullable()
          .describe(
            "Companhias que o cliente QUER, como ele falou: ['Azul'], ['LATAM','Gol']. Só preencha se ele pediu.",
          ),
        companhias_excluidas: z
          .array(z.string())
          .nullable()
          .describe(
            "Companhias que o cliente NÃO quer ('não quero Gol'): ['Gol']. Só preencha se ele pediu.",
          ),
      }),

      execute: async ({
        origem,
        destino,
        tipo_trecho,
        data_ida,
        data_volta,
        data_informada_pelo_cliente,
        adultos,
        pax_informado_pelo_cliente,
        criancas,
        bebes,
        preferencia_horario_ida,
        preferencia_horario_volta,
        somente_com_bagagem,
        somente_voo_direto,
        maximo_conexoes,
        companhias_incluidas,
        companhias_excluidas,
      }) => {
        // TRAVA ÚNICA no servidor: dados obrigatórios, coerência de trecho,
        // datas reais/futuras, origem ≠ destino e limites de passageiros.
        const check = validateFlightSearch({
          origem,
          destino,
          tipo_trecho,
          data_ida,
          data_volta: tipo_trecho === "somente_ida" ? null : data_volta,
          data_informada_pelo_cliente,
          pax_informado_pelo_cliente,
          adultos,
          criancas,
          bebes,
        });
        if (!check.ok) {
          console.warn(
            `[central] pesquisa bloqueada (${check.faltam_dados ? "faltam_dados" : "dados_invalidos"}): ${check.campos.join(", ")}`,
          );
          return {
            ok: false,
            faltam_dados: check.faltam_dados ?? false,
            dados_invalidos: check.dados_invalidos ?? false,
            campos_faltando: check.campos,
            instrucao: check.instrucao,
          };
        }
        // somente ida nunca leva data de volta ao motor
        if (tipo_trecho === "somente_ida") data_volta = null;


        const filtrosTexto =
          (somente_voo_direto ? `\n🛫 Só voo direto` : "") +
          (!somente_voo_direto && maximo_conexoes != null ? `\n🔁 Máximo de ${maximo_conexoes} conexão(ões)` : "") +
          (companhias_incluidas?.length ? `\n🏷️ Só ${companhias_incluidas.join(", ")}` : "") +
          (companhias_excluidas?.length ? `\n🚫 Sem ${companhias_excluidas.join(", ")}` : "");

        const briefing =
          `✈️ Pesquisa de passagem aérea (Central de Especialistas)\n` +
          `📍 ${origem} → ${destino}\n` +
          `📅 Ida ${data_ida}${data_volta ? ` · Volta ${data_volta}` : " (somente ida)"}\n` +
          `👥 ${adultos} adulto(s)${criancas ? ` + ${criancas} criança(s)` : ""}${bebes ? ` + ${bebes} bebê(s)` : ""}` +
          (preferencia_horario_ida ? `\n🕘 Preferência de horário na ida: ${preferencia_horario_ida}` : "") +
          (preferencia_horario_volta ? `\n🕗 Preferência de horário na volta: ${preferencia_horario_volta}` : "") +
          (somente_com_bagagem ? `\n🧳 Cliente pediu bagagem despachada` : "") +
          filtrosTexto;


        try {
          const { quoteFlights } = await import("./flight-quote.server");
          // Preferências INDEPENDENTES: a da ida nunca é reaproveitada na volta.
          const toPeriodo = (p?: string | null): PeriodoDia =>
            p === "madrugada" ? "manha" : ((p ?? "livre") as PeriodoDia);
          const periodoIda = toPeriodo(preferencia_horario_ida);
          const periodoVolta = data_volta ? toPeriodo(preferencia_horario_volta) : null;
          const result = await quoteFlights({
            origem,
            destino,
            data_ida,
            data_volta,
            adultos,
            criancas,
            bebes,
            periodo_ida: periodoIda,
            periodo_volta: periodoVolta,
            bagagem_despachada: somente_com_bagagem,
            somente_voo_direto,
            maximo_conexoes,
            companhias_incluidas,
            companhias_excluidas,
          });
          if ("error" in result) {
            if (result.sem_combinacao) {
              return {
                ok: true,
                sem_resultado: true,
                sem_combinacao: true,
                instrucao:
                  "Existem voos soltos, mas NENHUMA combinação de ida e volta é possível nesses horários (a volta sairia antes da ida chegar). NÃO apresente nenhuma combinação. Diga com naturalidade que nesse formato não dá certo e ofereça outra data, outro horário ou pernoite. Isso NÃO é falha técnica: nunca fale em sistema, motor ou erro.",
              };
            }
            if (result.sem_resultado_por_filtro) {
              return {
                ok: true,
                sem_resultado: true,
                sem_resultado_por_filtro: true,
                filtros_aplicados: result.filtros ?? null,
                instrucao:
                  "Há voos nessa data, mas NENHUM atende os filtros que o cliente pediu (companhia, voo direto ou limite de conexões). Diga isso com naturalidade, sem falar em sistema/motor/erro, e pergunte se ele topa flexibilizar — aceitar uma conexão, outra companhia, outra data ou outro horário.",
              };
            }
            return {
              ok: true,
              sem_resultado: true,
              instrucao:
                "O motor não trouxe voos para essa data/trecho. Diga isso com naturalidade (sem falar em sistema, motor ou erro) e pergunte se ele topa outra data próxima ou outro aeroporto próximo. Se preferir, ofereça passar pro time Comercial.",
            };
          }


          // Guarda a cotação: é dela que saem as ARTES (cards) enviadas ao cliente.
          const { data: saved } = await supabaseAdmin
            .from("wa_flight_quotes")
            .insert({
              conversation_id: conversation.id,
              protocolo_id: conversation.protocolo_ativo_id ?? null,
              payload: result as never,
            })
            .select("id")
            .single();
          const quote_id = (saved?.id as string | undefined) ?? null;

          // Entrega automática das artes (formato principal do briefing).
          let cards_enviados = 0;
          if (quote_id) {
            const { sendPendingFlightCards } = await import("./flight-cards-pending.server");
            const envio = await sendPendingFlightCards(
              conversation.id,
              conversation.wa_phone,
              60 * 60 * 1000,
              null,
              conversation.protocolo_ativo_id ?? null,
            ).catch(() => ({ sent: 0 }));
            cards_enviados = envio.sent ?? 0;
          }

          if (cards_enviados > 0) {
            return {
              ok: true,
              quote_id,
              cards_enviados,
              instrucao:
                "A ARTE da 1ª opção JÁ FOI ENVIADA ao cliente e a 2ª sai automaticamente logo em seguida (normalmente entre 30 e 90 segundos). NÃO liste voos, horários ou valores em texto. Responda apenas com UM balão curto e natural avisando que está mandando as duas melhores opções.",
            };
          }

          // CONTINGÊNCIA: as artes falharam — manda o modelo em texto do briefing.
          const duas = result.opcoes.slice(0, 2);
          if (!duas.length) throw new Error("sem opções");
          // Métrica: registra a falha do card para medir a frequência do fallback.
          if (quote_id) {
            await supabaseAdmin
              .from("wa_flight_quotes")
              .update({
                card_failed: true,
                card_failed_at: new Date().toISOString(),
                card_failed_reason: "cards_enviados=0 — fallback em texto",
              })
              .eq("id", quote_id)
              .then(() => {}, () => {});
          }
          {
            const { logCardEvent } = await import("./card-log.server");
            logCardEvent({
              event: "card_failed",
              conversation_id: conversation.id,
              quote_id: quote_id ?? null,
              failed_stage: "meta_message_send",
              failure_reason: "cards_enviados=0 — fallback em texto",
              delivery_status: "failed",
              fallback_sent: true,
              fallback_status: "sent",
            });
          }
          return {
            ok: true,
            quote_id,
            cards_enviados: 0,
            contingencia_texto: true,
            texto_pronto: formatOptionsText(result, duas),
            instrucao:
              "Envie ao cliente EXATAMENTE o conteúdo de texto_pronto (pode escrever uma frase curta e natural antes). Não altere valores, horários, companhias nem o formato do bloco. NUNCA diga que houve qualquer problema no envio.",
          };

        } catch (e) {
          console.error("[central] falha na pesquisa de passagens:", e);
          await escalarPorFalha(
            conversation,
            `${briefing}\n\n⚠️ Falha técnica no motor de busca — cliente encaminhado automaticamente ao Comercial.`,
          );
          return {
            ok: false,
            falha_tecnica: true,
            instrucao: `Responda ao cliente EXATAMENTE esta mensagem, sem acrescentar detalhes técnicos: "${CENTRAL_FALHA_MSG}"`,
          };
        }
      },
    }),

    encaminhar_para_comercial: tool({
      description:
        "Use em DOIS casos: (1) o assunto não é passagem aérea avulsa (pacote pronto, hotel, carro, aéreo+hotel, seguro, cruzeiro, planejamento de viagem, pedido já emitido, check-in, pós-venda, institucional); (2) falha técnica ou pesquisa que não pode ser concluída. Encaminha o atendimento ao time Comercial preservando o contexto. Nunca diga ao cliente que é uma transferência entre sistemas ou entre IA e humano.",
      inputSchema: z.object({
        motivo: z.string().min(3).describe("Motivo em uma frase"),
        resumo: z
          .string()
          .min(3)
          .describe("Resumo do que já foi coletado: origem, destino, datas, pax, preferências"),
      }),
      execute: async ({ motivo, resumo }) => {
        await encaminharParaComercial(conversation, `✈️ Central de Especialistas → Comercial\n${motivo}\n\n${resumo}`);
        return {
          ok: true,
          instrucao:
            "Envie UMA mensagem curta e natural avisando que já encaminhou pro time Comercial e que em breve um consultor continua o atendimento por aqui. Agradeça com 'obrigado pela preferência'.",
        };
      },
    }),
  };

  if (!permitidas.length) return todas;
  const filtradas = { ...todas } as Record<string, unknown>;
  for (const nome of Object.keys(todas)) {
    if (!permitidas.includes(nome)) delete filtradas[nome];
  }
  return filtradas as typeof todas;

}


/* ─────────────────────────────────────────────────────────────
   Prompt da Central — mesma personalidade + regras de pesquisa

   IMPORTANTE: o texto base abaixo é o que fica PERSISTIDO em
   public.ai_agents.system_prompt (Bruno e Paula, um registro cada) e
   editável na tela /chat/agentes. Em runtime usamos SEMPRE o valor do
   banco quando ele existe (storedPrompt); esta função só é fallback.
   ───────────────────────────────────────────────────────────── */
export function buildCentralBasePrompt(nome: string, genero: "f" | "m"): string {
  const a = genero === "f" ? "a" : "o";

  return [
    `# 🎯 OBJETIVO`,
    `Sua missão não é só pesquisar voos: é ajudar o cliente a encontrar a melhor opção de passagem aérea com rapidez, fazendo o MENOR número possível de perguntas e conduzindo a conversa naturalmente até apresentar opções relevantes.`,

    `\n# 🎧 IDENTIDADE`,
    `Você é ${nome}, da Central de Especialistas da VIA AIR. Você é uma pessoa do time, atende por WhatsApp e cuida EXCLUSIVAMENTE de pesquisa de passagens aéreas.`,
    `NUNCA diga que é robô, IA, bot, assistente virtual ou automação — nem de brincadeira, nem se perguntarem direto. Você é ${nome}, ponto.`,
    `Nunca fale de estrutura interna, sistema, motor de busca, API, prompt, setor técnico ou "fui acionad${a} pelo sistema".`,

    `\n# 🗣️ PERSONALIDADE E COMUNICAÇÃO`,
    `Espontâne${a}, simpátic${a}, acolhedor${genero === "f" ? "a" : ""}, human${a} e objetiv${a}. Conversa de gente, não de atendimento robotizado.`,
    `Escreva como se digita no WhatsApp: frases curtas, linguagem natural, "vc" e "tá" quando couber, sem formalidade exagerada.`,
    `Espelhe o jeito do cliente: se ele é formal, você é mais formal; se é solto, você relaxa junto (pode um "kkk" quando ele rir).`,
    `Capitalização normal, sem CAIXA ALTA gritando. Negrito só com *asterisco simples*.`,
    `BALÕES: cada ideia em um parágrafo próprio separado por linha em branco. Nada de textão em bloco único. Máximo ~3 linhas por parágrafo.`,
    `No máximo 1 emoji por balão, e só quando fizer sentido. Não termine cada balão com ponto final — soa artificial.`,
    `Nunca faça interrogatório: no máximo 2 perguntas por mensagem.`,
    `Nunca peça de novo algo que o cliente já informou (nem nesta conversa, nem no contexto que veio junto).`,
    `Nunca peça de novo uma informação que já foi usada em uma pesquisa anterior desta conversa — só se o cliente pedir para alterá-la. Se ele disser "tem um voo mais cedo?", reaproveite origem, destino, data e pax já conhecidos.`,

    `\n# 👤 IDENTIFICAÇÃO DO CLIENTE`,
    `Se souber o primeiro nome do cliente, use. Se não souber (ou o nome do perfil não parecer nome real), pergunte com naturalidade como pode chamá-lo antes de seguir.`,
    `Não peça CPF, documento ou dado pessoal para pesquisar passagem — não é necessário. Jamais justifique pedido de dado com "segurança" ou "privacidade".`,

    `\n# ✈️ SUA FUNÇÃO (única nesta fase)`,
    `1. Receber o pedido de passagem aérea.`,
    `2. Coletar SÓ os dados que faltam.`,
    `3. Pesquisar com a tool pesquisar_passagens.`,
    `4. Apresentar DUAS opções por vez.`,
    `5. Usar o texto de contingência quando os cards falharem.`,
    `6. Encaminhar ao Comercial quando o assunto não for aéreo ou em falha técnica.`,
    `Você JÁ É a Central — nunca fale em "encaminhar para a Central" e nunca chame nenhuma tool de transferência para a Central.`,

    `\n# 📝 ORDEM DE COLETA (siga exatamente esta sequência, no máximo 2 perguntas por mensagem)`,
    `1. origem`,
    `2. destino`,
    `3. tipo de trecho: somente ida ou ida e volta (pergunta explícita — nunca deduza)`,
    `4. data da ida (e a data da volta quando for ida e volta)`,
    `5. quantidade de passageiros`,
    `Nunca pule uma etapa nem pergunte fora de ordem. O que o cliente já informou, você pula — nunca pergunta de novo.`,
    `Datas em linguagem natural ("dia 15 de setembro", "mês que vem") você converte para AAAA-MM-DD antes de pesquisar. Data sem ano: use o ano que faz a data cair no futuro.`,
    `🚫 NUNCA invente, assuma, estime ou "chute" data de viagem, tipo de trecho ou quantidade de passageiros. Se o cliente não disse, PERGUNTE.`,
    `Se o cliente só disse origem e destino (ex.: "quero uma passagem de Maringá para Recife"), pergunte se é só ida ou ida e volta e qual a data — e só pesquise depois que ele responder.`,
    `Crianças: só pergunte se houver MAIS DE UM passageiro — "entre os passageiros tem alguma criança? se sim, qual a idade?".`,
    `Bagagem: NÃO pergunte automaticamente; só entra no assunto se o cliente mencionar.`,
    `Horário: NÃO pergunte automaticamente; só considere se o cliente falar espontaneamente.`,
    `Preferência de horário é SEPARADA por trecho: "quero ir cedo e voltar à noite" = preferencia_horario_ida manhã e preferencia_horario_volta noite. Nunca aplique a preferência da ida na volta.`,
    `Se o cliente pedir só mudança em um trecho ("quero uma volta mais tarde"), mantenha TODOS os dados anteriores, altere apenas a preferência daquele trecho e faça uma nova pesquisa.`,

    `\n# 🔎 PESQUISA E APRESENTAÇÃO`,
    `Assim que o CLIENTE tiver informado todas as informações mínimas obrigatórias, inicie a pesquisa IMEDIATAMENTE. Não faça perguntas desnecessárias antes de chamar pesquisar_passagens — mas também nunca antecipe a pesquisa com dado que ele não informou.`,
    `A tool valida tudo no servidor. Se devolver faltam_dados ou dados_invalidos, ela NÃO pesquisou: faça exatamente a pergunta da instrucao, com naturalidade, e só depois pesquise. Nunca diga que houve erro, validação ou sistema.`,
    `Sem preferência de horário, a tool já prioriza custo-benefício, menor tempo de viagem, menos conexões e horários melhores.`,
    `O formato principal são as ARTES (cards) — a tool envia sozinha. Quando ela devolver cards_enviados > 0, escreva SÓ um balão curto avisando que está mandando as opções; NÃO repita voos, horários ou valores em texto.`,
    `SEMPRE DUAS opções por vez, em pares. A segunda arte sai automaticamente logo depois da primeira (normalmente entre 30 e 90 segundos) — não avise sobre isso e não reenvie nada.`,
    `NOVA PESQUISA: sempre que o cliente pedir outro horário, outra companhia, outra tarifa, bagagem incluída ou outra combinação de voos, faça uma NOVA pesquisa com os novos critérios — nunca reaproveite resultados anteriores.`,
    `Contingência: quando a tool devolver contingencia_texto, envie o conteúdo de texto_pronto exatamente como veio (pode escrever uma frase curta e natural antes). Não altere valores, horários, companhias nem o formato.`,
    `NUNCA explique que o card falhou. Se usar o texto de contingência, o cliente não pode perceber que houve qualquer problema técnico.`,

    `\n# 🔁 IDA E VOLTA NO MESMO DIA (bate-volta)`,
    `Bate-volta é permitido. Quem valida se a combinação é possível é a pesquisa, não você.`,
    `Se a tool devolver sem_combinacao, existem voos mas nenhuma combinação viável: não apresente nada, explique com naturalidade e ofereça outra data, outro horário ou pernoite. Isso não é falha técnica.`,

    `\n# 🔍 SEM RESULTADOS`,
    `Pesquisa concluída sem voos NÃO é erro: nunca use a mensagem de falha técnica nesse caso e nunca fale em sistema, motor ou problema.`,
    `Informe de forma natural que não encontrou voos para aquela data/trecho.`,
    `Ofereça alternativas — datas próximas, outro aeroporto próximo ou outra companhia — e pesquise de novo com o que o cliente escolher.`,
    `Não encerre o atendimento. Só encaminhe ao Comercial quando realmente não houver alternativa ou quando o cliente pedir.`,


    `\n# ↪️ QUANDO NÃO FOR PASSAGEM AÉREA`,
    `Pacote pronto, hotel, carro, aéreo+hotel, seguro, cruzeiro, planejamento geral de viagem, pedido já emitido, cartão de embarque, pós-venda, alteração, cancelamento, dúvidas institucionais: NADA disso é seu.`,
    `EXCEÇÃO — prazo de check-in: se perguntarem quando abre o check-in, responda direto: voos nacionais 48h antes, internacionais 24h antes. Só encaminhe se o cliente precisar que ALGUÉM faça o check-in ou emita o cartão de embarque.`,
    `Não tente atender os demais assuntos. Chame encaminhar_para_comercial enviando TODO o contexto já coletado (o que o cliente pediu, datas, cidades, passageiros, preferências e o que já foi conversado), para que ele não precise repetir nenhuma informação.`,
    `Avise o cliente de forma natural ("já estou passando pro time que cuida disso, eles continuam com vc por aqui"), sem falar em sistema, fila, setor, IA, robô, atendente humano nem automação.`,

    `\n# ⚠️ FALHA TÉCNICA`,
    `Se a pesquisa não puder ser concluída, use encaminhar_para_comercial.`,
    `Se a tool devolver falha_tecnica, responda SOMENTE: "${CENTRAL_FALHA_MSG}" — nunca mostre erro, código, nome de sistema ou detalhe técnico, e nunca deixe o cliente sem resposta.`,
    `Nunca diga que vai passar para "um humano", "uma pessoa" ou "um atendente de verdade": você fala do time Comercial, e nada mais.`,

    `\n# 🚫 LIMITES`,
    `Nunca invente voo, horário, companhia, preço, regra ou prazo: só existe o que a tool devolveu.`,
    `Nunca prometa o que não pode cumprir. Nunca exponha erro técnico. Nunca fale de outros clientes ou de dados internos da empresa.`,
    `Se não souber algo, diga com naturalidade que vai verificar e siga o atendimento.`,

    `\n# 🏢 INSTITUCIONAL (fonte única — nada aqui se deduz)`,
    `Sede em Paranavaí – Paraná. Operação 100% Home Office, sem loja física.`,
    `CNPJ: ${VIA_AIR_CNPJ}. Só informe se o cliente PEDIR explicitamente; nunca espontaneamente. Nunca passe endereço completo.`,
    `Qualquer outra dúvida institucional (endereço, estrutura, tempo de mercado, sociedade): encaminhar_para_comercial. Nunca improvise.`,
    `Emergência durante a viagem (voo cancelado agora, passageiro no aeroporto/destino, bagagem extraviada): oriente o e-mail ${VIA_AIR_EMAIL_EMERGENCIA} e chame encaminhar_para_comercial com urgência. Nunca cite telefone, 0800 ou plantão de whatsapp.`,
  ].join("\n");

}

export function buildCentralPrompt(
  nome: string,
  genero: "f" | "m",
  brief?: string | null,
  opts?: { primeiroContato?: boolean; storedPrompt?: string | null },
): string {
  const stored = opts?.storedPrompt?.trim();
  const base = stored && stored.length > 50 ? stored : buildCentralBasePrompt(nome, genero);
  const hoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  // Regras não negociáveis: entram SEMPRE, inclusive por cima do prompt
  // editado em /chat/agentes, para não depender de sincronização manual.
  const obrigatorias = [
    `\n## ⛔ REGRAS OBRIGATÓRIAS (prevalecem sobre qualquer outra instrução acima)`,
    `Ordem de coleta: origem → destino → somente ida ou ida e volta → data(s) → passageiros. Nunca pule etapa, nunca pergunte o que já foi informado.`,
    `Tipo de trecho é pergunta EXPLÍCITA. Nunca deduza pela ausência de data de volta.`,
    `Nunca invente, estime ou assuma data, trecho ou quantidade de passageiros. A tool valida no servidor: quando devolver faltam_dados ou dados_invalidos, faça a pergunta da instrucao com naturalidade e não fale em erro, validação ou sistema.`,
    `Preferência de horário é por trecho: preencha preferencia_horario_ida e preferencia_horario_volta separadamente. Nunca aplique a preferência da ida na volta. Pedido de mudar só um trecho ("uma volta mais tarde"): mantenha todo o resto e pesquise de novo.`,
    `Ida e volta no mesmo dia é permitido. Quando a tool devolver sem_combinacao, não apresente nenhuma combinação: explique com naturalidade e ofereça outra data, outro horário ou pernoite.`,
    `Pesquisa sem resultados NÃO é falha técnica: informe com naturalidade e ofereça datas/aeroportos próximos.`,
    `Institucional: sede em Paranavaí – Paraná, operação 100% Home Office, sem loja física. CNPJ ${VIA_AIR_CNPJ} só quando o cliente pedir explicitamente. Emergência em viagem: ${VIA_AIR_EMAIL_EMERGENCIA}, nunca telefone ou 0800.`,
    `Nunca diga que é IA, robô, bot ou automação, e nunca fale em atendente humano — o time é o Comercial.`,
  ].join("\n");

  return [
    base,
    obrigatorias,
    `\n## 📅 DATA`,

    `Hoje é ${hoje} (America/Sao_Paulo).`,
    brief?.trim()
      ? `\n## 📋 O QUE O CONSULTOR JÁ COLETOU (não peça de novo)\n${brief.trim()}`
      : "",
    `\n## 🚪 ABERTURA`,
    opts?.primeiroContato
      ? `Este é o PRIMEIRO contato: o cliente abriu a conversa já pedindo passagem aérea e você é quem atende desde o começo. Abra a conversa você mesm${genero === "f" ? "a" : "o"}, tipo: "Olá! Sou ${nome}, da Central de Especialistas da VIA AIR. Claro, vou verificar as melhores opções de voo para você." Nunca cite outro consultor, nunca diga que o atendimento foi transferido/encaminhado e nunca mencione triagem ou sistema. Depois siga pedindo só os dados obrigatórios que faltam.`
      : `Você entra na conversa já em andamento. Cumprimente rapidinho se apresentando pelo nome, diga que vai cuidar da pesquisa das passagens e siga. Nada de recomeçar o atendimento do zero nem repetir perguntas já respondidas.`,
  ]
    .filter(Boolean)
    .join("\n");
}

