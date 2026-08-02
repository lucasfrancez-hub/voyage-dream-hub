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
import { buildSharedAgentPrompt } from "@/lib/chat/camila-prompt";
import { recordHandoff, type WaConversation } from "./conversation.server";
import type {
  FlightQuoteLeg,
  FlightQuoteOption,
  FlightQuoteResult,
  PeriodoDia,
} from "./flight-quote.server";

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
   Helpers de formatação (modelo de contingência em texto)
   ───────────────────────────────────────────────────────────── */
function fmtDataHora(s: string): { data: string; hora: string } {
  // "2026-08-10 07:35"
  const [d, h] = String(s ?? "").split(" ");
  const [y, m, dd] = (d ?? "").split("-");
  return { data: dd && m ? `${dd}/${m}/${y}` : (d ?? "—"), hora: h ?? "—" };
}

function legBlock(leg: FlightQuoteLeg, icon: string): string[] {
  const ida = fmtDataHora(leg.partida);
  const chg = fmtDataHora(leg.chegada);
  const paradas =
    leg.paradas <= 0
      ? "Direto"
      : `${leg.paradas === 1 ? "1 conexão" : `${leg.paradas} conexões`}${leg.escalas?.length ? ` em ${leg.escalas.join(", ")}` : ""}`;
  const lines = [
    `📅 ${ida.data}`,
    `${icon} ${ida.hora} → ${chg.hora}`,
    `🏢 ${leg.cia}`,
    `🔁 ${paradas}`,
  ];
  if (leg.paradas > 0 && leg.duracao) lines.push(`⏱ Tempo total: ${leg.duracao}`);
  return lines;
}

/** Monta o texto de contingência exatamente no modelo aprovado no briefing. */
export function formatOptionsText(quote: FlightQuoteResult, opcoes: FlightQuoteOption[]): string {
  const sep = "━━━━━━━━━━━━━━━━━━";
  const blocks: string[] = [];
  opcoes.forEach((op, i) => {
    const lines: string[] = [
      sep,
      `✈️ Opção ${i + 1}`,
      `📍 ${quote.origem_nome} → ${quote.destino_nome}`,
    ];
    if (op.volta) {
      lines.push("", "Ida", ...legBlock(op.ida, "🕘"), "", "Volta", ...legBlock(op.volta, "🕓"));
    } else {
      lines.push(...legBlock(op.ida, "🕘"));
    }
    lines.push(
      `🧳 ${op.bagagem_despachada ? "Tarifa com bagagem despachada incluída" : "Tarifa promocional (bagagem conforme tarifa)"}`,
    );
    lines.push(`💰 ${op.por_pessoa_formatado} por pessoa`);
    blocks.push(lines.join("\n"));
  });
  blocks.push(sep);
  blocks.push(
    "Se preferir, posso pesquisar outras companhias, horários ou opções com bagagem incluída.",
  );
  return blocks.join("\n");
}

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

/* ─────────────────────────────────────────────────────────────
   Tools da Central
   ───────────────────────────────────────────────────────────── */
export function buildCentralTools(conversation: WaConversation) {
  return {
    pesquisar_passagens: tool({
      description:
        "Pesquisa passagens aéreas no motor de busca oficial (Comprar Viagem) e ENVIA automaticamente as ARTES (cards) das duas melhores opções ao cliente. Use somente quando tiver origem, destino, data de ida, se é só ida ou ida e volta, e quantidade de passageiros. Se o cliente pedir outro horário depois, chame de novo com a preferência de horário.",
      inputSchema: z.object({
        origem: z.string().min(2).describe("Cidade ou IATA de origem, ex.: 'Maringá' ou 'MGF'"),
        destino: z.string().min(2).describe("Cidade ou IATA de destino, ex.: 'Recife' ou 'REC'"),
        data_ida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data de ida AAAA-MM-DD"),
        data_volta: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .describe("Data de volta AAAA-MM-DD, ou null se for somente ida"),
        adultos: z.number().int().min(1).max(9),
        criancas: z.number().int().min(0).max(9).nullable().describe("Crianças de 2 a 11 anos"),
        bebes: z.number().int().min(0).max(9).nullable().describe("Bebês de colo (menos de 2 anos)"),
        preferencia_horario: z
          .enum(["manha", "tarde", "noite", "madrugada"])
          .nullable()
          .describe("Só preencha se o cliente informou espontaneamente"),
        somente_com_bagagem: z
          .boolean()
          .nullable()
          .describe("Só true se o cliente pediu bagagem despachada"),
      }),
      execute: async ({
        origem,
        destino,
        data_ida,
        data_volta,
        adultos,
        criancas,
        bebes,
        preferencia_horario,
        somente_com_bagagem,
      }) => {
        const briefing =
          `✈️ Pesquisa de passagem aérea (Central de Especialistas)\n` +
          `📍 ${origem} → ${destino}\n` +
          `📅 Ida ${data_ida}${data_volta ? ` · Volta ${data_volta}` : " (somente ida)"}\n` +
          `👥 ${adultos} adulto(s)${criancas ? ` + ${criancas} criança(s)` : ""}${bebes ? ` + ${bebes} bebê(s)` : ""}` +
          (preferencia_horario ? `\n🕘 Preferência de horário: ${preferencia_horario}` : "") +
          (somente_com_bagagem ? `\n🧳 Cliente pediu bagagem despachada` : "");

        try {
          const { quoteFlights } = await import("./flight-quote.server");
          const periodo: PeriodoDia =
            preferencia_horario === "madrugada"
              ? "manha"
              : ((preferencia_horario ?? "livre") as PeriodoDia);
          const result = await quoteFlights({
            origem,
            destino,
            data_ida,
            data_volta,
            adultos,
            criancas,
            bebes,
            periodo_ida: periodo,
            periodo_volta: null,
            bagagem_despachada: somente_com_bagagem,
          });
          if ("error" in result) {
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
                "A ARTE da 1ª opção JÁ FOI ENVIADA ao cliente e a 2ª sai automaticamente em cerca de 1 minuto. NÃO liste voos, horários ou valores em texto. Responda apenas com UM balão curto e natural avisando que está mandando as duas melhores opções.",
            };
          }

          // CONTINGÊNCIA: as artes falharam — manda o modelo em texto do briefing.
          const duas = result.opcoes.slice(0, 2);
          if (!duas.length) throw new Error("sem opções");
          return {
            ok: true,
            quote_id,
            cards_enviados: 0,
            contingencia_texto: true,
            texto_pronto: formatOptionsText(result, duas),
            instrucao:
              "Envie ao cliente EXATAMENTE o conteúdo de texto_pronto (pode escrever uma frase curta e natural antes). Não altere valores, horários, companhias nem o formato do bloco.",
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
        "Use quando a pesquisa não puder ser concluída, quando o cliente pedir algo fora de passagens aéreas (pacote, hotel, carro, seguro, cruzeiro) ou quando ele pedir para falar com um consultor. Encaminha o atendimento pro time Comercial mantendo todo o contexto já coletado.",
      inputSchema: z.object({
        motivo: z.string().min(3).describe("Motivo em uma frase"),
        resumo: z
          .string()
          .min(3)
          .describe("Resumo do que já foi coletado: origem, destino, datas, pax, preferências"),
      }),
      execute: async ({ motivo, resumo }) => {
        await escalarPorFalha(conversation, `✈️ Central de Especialistas → Comercial\n${motivo}\n\n${resumo}`);
        return {
          ok: true,
          instrucao:
            "Envie UMA mensagem curta e natural avisando que já encaminhou pro time Comercial e que em breve um consultor continua o atendimento por aqui. Agradeça com 'obrigado pela preferência'.",
        };
      },
    }),
  };
}

/* ─────────────────────────────────────────────────────────────
   Prompt da Central — mesma personalidade + regras de pesquisa
   ───────────────────────────────────────────────────────────── */
export function buildCentralPrompt(
  nome: string,
  genero: "f" | "m",
  brief?: string | null,
  opts?: { primeiroContato?: boolean },
): string {
  const base = buildSharedAgentPrompt(nome, genero);
  const hoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const modulosOff = (Object.keys(CENTRAL_MODULES) as CentralModule[])
    .filter((m) => !CENTRAL_MODULES[m])
    .join(", ");

  return [
    base,
    `\n\n# 🎧 VOCÊ É DA CENTRAL DE ESPECIALISTAS`,
    `Você faz parte da mesma equipe VIA AIR e atende com a MESMA personalidade, tom e jeito de escrever das consultoras. Para o cliente você é só mais uma pessoa do time — nunca explique estrutura interna, nunca diga "fui acionada pelo sistema", nunca fale de IA, motor de busca, API ou setores técnicos.`,
    `Sua especialidade nesta fase é UMA só: PESQUISA DE PASSAGENS AÉREAS.`,
    `Hoje é ${hoje} (America/Sao_Paulo). Toda data que o cliente falar em linguagem natural ("dia 15 de setembro", "mês que vem") você converte para AAAA-MM-DD antes de pesquisar.`,
    brief?.trim()
      ? `\n## 📋 O QUE O CONSULTOR JÁ COLETOU (não peça de novo)\n${brief.trim()}`
      : "",
    `\n## 🚪 ABERTURA`,
    `Você entra na conversa já em andamento. Cumprimente rapidinho se apresentando pelo nome, diga que vai cuidar da pesquisa das passagens e siga. Nada de recomeçar o atendimento do zero nem repetir perguntas já respondidas.`,
    `\n## 📝 INFORMAÇÕES NECESSÁRIAS (nunca vire questionário)`,
    `Peça SÓ o que estiver faltando, no máximo 2 itens por mensagem, em tom de conversa:`,
    `- origem`,
    `- destino`,
    `- data da ida`,
    `- somente ida ou ida e volta (e a data da volta, se for o caso)`,
    `- quantidade de passageiros`,
    `Crianças: só pergunte se houver MAIS DE UM passageiro — "entre os passageiros há alguma criança? se sim, qual a idade?".`,
    `Bagagem: NÃO pergunte automaticamente. Só entra no assunto se fizer sentido ou se o cliente mencionar.`,
    `Horário: NÃO pergunte automaticamente. Só considere se o cliente falar espontaneamente; caso contrário pesquise as melhores opções.`,
    `\n## 🔎 PESQUISA`,
    `Quando tiver o mínimo necessário, chame a tool pesquisar_passagens. Sem preferência de horário, ela já prioriza custo-benefício, menor tempo de viagem, menos conexões e horários melhores.`,
    `O formato principal do resultado são as ARTES (cards) — a tool já envia sozinha. Quando ela devolver cards_enviados > 0, escreva SÓ um balão curto avisando que está mandando as opções; NÃO repita voos, horários ou valores em texto.`,
    `SEMPRE são DUAS opções. Se o cliente pedir outro horário, outra companhia ou bagagem incluída, faça uma NOVA pesquisa e apresente novamente duas opções. Sempre em pares.`,
    `Só quando a tool devolver contingencia_texto: envie o conteúdo de texto_pronto exatamente como veio (pode escrever uma frase curta e natural antes e depois). Não invente voo, horário, companhia ou preço — só existe o que a tool devolveu.`,
    `\n## 🚫 O QUE NÃO É SEU`,
    `Pacotes prontos, personalização de viagem, ${modulosOff} — nada disso é da Central nesta fase. Se o cliente pedir, use encaminhar_para_comercial e avise com naturalidade que o time Comercial continua com ele.`,
    `\n## ⚠️ FALHAS`,
    `Se qualquer coisa der errado (a tool retornar falha_tecnica), responda SOMENTE: "${CENTRAL_FALHA_MSG}" — nunca mostre erro, código, nome de sistema ou detalhe técnico, e nunca deixe o cliente sem resposta.`,
  ]
    .filter(Boolean)
    .join("\n");
}
