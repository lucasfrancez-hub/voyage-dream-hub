/**
 * CENTRAL DE ESPECIALISTAS — camada de atendimento que opera os motores de
 * busca (1ª fase: PASSAGENS AÉREAS via Comprar Viagem / OnerTravel).
 *
 * Regras de ouro:
 * - Não altera nada das IAs consultoras (Camila, Roberto, Nath, ...).
 * - Reutiliza integralmente o motor já existente (src/lib/onertravel.server.ts).
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
import {
  searchAirports,
  searchFlights,
  searchInboundFlights,
} from "@/lib/onertravel.server";
import { flightHasBaggage, type OnerFlight } from "@/lib/onertravel.types";

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
const pad = (n: number) => String(n).padStart(2, "0");

function fmtDate(p: OnerFlight["journey"]["departure"]): string {
  const d = p?.date;
  if (!d) return "—";
  return `${pad(d.day)}/${pad(d.month)}/${d.year}`;
}
function fmtTime(p?: { time?: { hour: number; minute: number } }): string {
  const t = p?.time;
  if (!t) return "—";
  return `${pad(t.hour)}:${pad(t.minute)}`;
}
function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function stopsLabel(f: OnerFlight): string {
  const segs = f.journey.segments ?? [];
  const stops = f.journey.numberOfStops ?? Math.max(0, segs.length - 1);
  if (stops <= 0) return "Direto";
  const conexoes = segs
    .slice(0, -1)
    .map((s) => s.destination?.city || s.destination?.iata)
    .filter(Boolean)
    .join(", ");
  const plural = stops === 1 ? "1 conexão" : `${stops} conexões`;
  return conexoes ? `${plural} em ${conexoes}` : plural;
}
function durationLabel(f: OnerFlight): string | null {
  const t = f.journey.flyingTime;
  if (!t) return null;
  return `${t.hour}h${t.minute ? pad(t.minute) : "00"}`;
}
function durationMinutes(f: OnerFlight): number {
  const t = f.journey.flyingTime;
  return (t?.hour ?? 0) * 60 + (t?.minute ?? 0);
}
function airline(f: OnerFlight): string {
  return f.journey.marketingAirline?.name || f.journey.marketingAirline?.iata || "—";
}
function fareLabel(f: OnerFlight): string {
  const fam = f.journey.fareClass?.airlineFareFamily?.trim();
  if (flightHasBaggage(f)) {
    return fam
      ? `Tarifa ${fam} (bagagem despachada incluída)`
      : "Tarifa com bagagem despachada incluída";
  }
  return fam ? `Tarifa ${fam} (bagagem conforme tarifa)` : "Tarifa promocional (bagagem conforme tarifa)";
}

function legBlock(f: OnerFlight, prefixIcon: string): string[] {
  const dur = durationLabel(f);
  const stops = stopsLabel(f);
  const lines = [
    `📅 ${fmtDate(f.journey.departure)}`,
    `${prefixIcon} ${fmtTime(f.journey.departure)} → ${fmtTime(f.journey.destination)}`,
    `🏢 ${airline(f)}`,
    `🔁 ${stops}`,
  ];
  if (stops !== "Direto" && dur) lines.push(`⏱ Tempo total: ${dur}`);
  return lines;
}

export type CentralOption = {
  outbound: OnerFlight;
  inbound: OnerFlight | null;
  totalPorPessoa: number;
};

/** Monta o texto de contingência exatamente no modelo aprovado no briefing. */
export function formatOptionsText(
  origem: string,
  destino: string,
  options: CentralOption[],
): string {
  const sep = "━━━━━━━━━━━━━━━━━━";
  const blocks: string[] = [];
  options.forEach((opt, i) => {
    const o = opt.outbound;
    const inb = opt.inbound;
    const lines: string[] = [sep, `✈️ Opção ${i + 1}`, `📍 ${origem} → ${destino}`];
    if (inb) {
      lines.push("", "Ida", ...legBlock(o, "🕘"), "", "Volta", ...legBlock(inb, "🕓"));
    } else {
      lines.push(`📅 Ida: ${fmtDate(o.journey.departure)}`);
      lines.push(`🕘 ${fmtTime(o.journey.departure)} → ${fmtTime(o.journey.destination)}`);
      lines.push(`🏢 ${airline(o)}`);
      lines.push(`🔁 ${stopsLabel(o)}`);
      const dur = durationLabel(o);
      if (stopsLabel(o) !== "Direto" && dur) lines.push(`⏱ Tempo total: ${dur}`);
    }
    lines.push(`🧳 ${fareLabel(inb ?? o)}`);
    lines.push(`💰 ${fmtBRL(opt.totalPorPessoa)} por pessoa`);
    blocks.push(lines.join("\n"));
  });
  blocks.push(sep);
  blocks.push(
    "Se preferir, posso pesquisar outras companhias, horários ou opções com bagagem incluída.",
  );
  return blocks.join("\n");
}

/* ─────────────────────────────────────────────────────────────
   Seleção das 2 melhores opções
   ───────────────────────────────────────────────────────────── */
function pickTwo(flights: OnerFlight[]): OnerFlight[] {
  if (flights.length <= 2) return flights.slice(0, 2);
  const byPrice = [...flights].sort((a, b) => a.price.total - b.price.total);
  const first = byPrice[0];
  const cheapest = first.price.total || 1;
  // 2ª opção: melhor custo-benefício entre as demais (menos conexões,
  // menor tempo de voo), penalizando preço acima do mais barato.
  const rest = byPrice.slice(1);
  const score = (f: OnerFlight) =>
    (f.journey.numberOfStops ?? 0) * 90 +
    durationMinutes(f) +
    ((f.price.total - cheapest) / cheapest) * 240;
  const second = rest.reduce((best, f) => (score(f) < score(best) ? f : best), rest[0]);
  return [first, second];
}

function inWindow(f: OnerFlight, from: number | null, to: number | null): boolean {
  if (from == null && to == null) return true;
  const t = f.journey.departure?.time;
  const mins = (t?.hour ?? 0) * 60 + (t?.minute ?? 0);
  if (from != null && mins < from) return false;
  if (to != null && mins > to) return false;
  return true;
}

async function resolveAirport(query: string): Promise<{ iata: string; isCity: boolean; label: string } | null> {
  const q = query.trim();
  if (!q) return null;
  // Se o cliente já mandou o IATA
  if (/^[A-Za-z]{3}$/.test(q)) {
    return { iata: q.toUpperCase(), isCity: false, label: q.toUpperCase() };
  }
  const list = await searchAirports({ query: q, isDeparture: true });
  const hit = list.find((a) => a.isCity) ?? list[0];
  if (!hit) return null;
  return {
    iata: hit.iata,
    isCity: hit.isCity,
    label: hit.city || hit.name || hit.iata,
  };
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
    .update({ tags, assigned_to: null, priority: "high" })
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
        "Pesquisa passagens aéreas no motor de busca oficial (Comprar Viagem) e devolve as DUAS melhores opções já formatadas para enviar ao cliente. Use somente quando tiver origem, destino, data de ida, se é só ida ou ida e volta, e quantidade de passageiros. Se o cliente pedir outro horário depois, chame de novo com a preferência de horário.",
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
          const [from, to] = await Promise.all([resolveAirport(origem), resolveAirport(destino)]);
          if (!from || !to) throw new Error("aeroporto não resolvido");

          const janela: Record<string, [number, number]> = {
            madrugada: [0, 359],
            manha: [360, 719],
            tarde: [720, 1079],
            noite: [1080, 1439],
          };
          const win = preferencia_horario ? janela[preferencia_horario] : null;

          const result = await searchFlights(
            {
              departureIata: from.iata,
              arrivalIata: to.iata,
              departureDate: data_ida,
              returnDate: data_volta ?? null,
              adults: adultos,
              children: criancas ?? 0,
              infants: bebes ?? 0,
              pageSize: 50,
              departureIsCity: from.isCity,
              arrivalIsCity: to.isCity,
              searchKey: null,
              filters: {
                containsDispatchBaggage: !!somente_com_bagagem,
                maxStops: 2,
                startPrice: null,
                endPrice: null,
                departureFrom: win ? win[0] : null,
                departureTo: win ? win[1] : null,
                airlineIatas: [],
                cabinClass: null,
              },
            },
            "fast",
          );

          let outFlights = result.outbound.flights;
          if (win) {
            const filtered = outFlights.filter((f) => inWindow(f, win[0], win[1]));
            if (filtered.length) outFlights = filtered;
          }
          if (!outFlights.length) {
            return {
              ok: true,
              sem_resultado: true,
              instrucao:
                "O motor não trouxe voos para essa data/trecho. Diga isso com naturalidade (sem falar em sistema ou erro), e pergunte se ele topa outra data próxima ou outro aeroporto próximo. Se ele preferir, ofereça passar pro time Comercial.",
            };
          }

          const picks = pickTwo(outFlights);
          const options: CentralOption[] = [];

          for (const out of picks) {
            let inb: OnerFlight | null = null;
            if (data_volta) {
              const inboundRes = await searchInboundFlights(
                {
                  departureIata: from.iata,
                  arrivalIata: to.iata,
                  departureDate: data_ida,
                  returnDate: data_volta,
                  adults: adultos,
                  children: criancas ?? 0,
                  infants: bebes ?? 0,
                  pageSize: 50,
                  departureIsCity: from.isCity,
                  arrivalIsCity: to.isCity,
                  searchKey: result.searchKey,
                  flightKey: out.key,
                  filters: {
                    containsDispatchBaggage: !!somente_com_bagagem,
                    maxStops: 2,
                    startPrice: null,
                    endPrice: null,
                    departureFrom: null,
                    departureTo: null,
                    airlineIatas: [],
                    cabinClass: null,
                  },
                },
                "fast",
              );
              inb = inboundRes.flights[0] ?? null;
              if (!inb) continue;
            }
            const pax = Math.max(1, out.price.passengerCount || adultos + (criancas ?? 0));
            const total = out.price.total + (inb?.price.total ?? 0);
            options.push({ outbound: out, inbound: inb, totalPorPessoa: total / pax });
          }

          if (!options.length) throw new Error("sem combinação ida/volta");

          const texto = formatOptionsText(from.label, to.label, options);
          return {
            ok: true,
            opcoes: options.length,
            texto_pronto: texto,
            instrucao:
              "Envie ao cliente EXATAMENTE o conteúdo de texto_pronto (pode escrever uma frase curta e natural antes, tipo 'olha o que encontrei pra você'). Não altere valores, horários, companhias nem o formato do bloco.",
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
        resumo: z.string().min(3).describe("Resumo do que já foi coletado: origem, destino, datas, pax, preferências"),
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
export function buildCentralPrompt(nome: string, genero: "f" | "m", brief?: string | null): string {
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
    `SEMPRE apresente DUAS opções. Se o cliente pedir outro horário, outra companhia ou bagagem incluída, faça uma NOVA pesquisa e apresente novamente duas opções. Sempre em pares.`,
    `Ao enviar o resultado, use o conteúdo de texto_pronto exatamente como veio (você pode escrever uma frase curta e natural antes e depois). Não invente voo, horário, companhia ou preço — só existe o que a tool devolveu.`,
    `\n## 🚫 O QUE NÃO É SEU`,
    `Pacotes prontos, personalização de viagem, ${modulosOff} — nada disso é da Central nesta fase. Se o cliente pedir, use encaminhar_para_comercial e avise com naturalidade que o time Comercial continua com ele.`,
    `\n## ⚠️ FALHAS`,
    `Se qualquer coisa der errado (a tool retornar falha_tecnica), responda SOMENTE: "${CENTRAL_FALHA_MSG}" — nunca mostre erro, código, nome de sistema ou detalhe técnico, e nunca deixe o cliente sem resposta.`,
  ]
    .filter(Boolean)
    .join("\n");
}
