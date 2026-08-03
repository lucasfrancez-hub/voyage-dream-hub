/**
 * CONTINUIDADE DA PESQUISA AÉREA.
 *
 * Enquanto existir uma cotação ativa, toda mensagem sobre voo é REFINO da
 * mesma pesquisa — nunca uma pergunta isolada. Este módulo detecta o refino
 * ("tem por Congonhas?", "tem mais opções?", "sem conexão", "mais barato")
 * e monta um bloco de contexto que obriga o agente a chamar
 * `pesquisar_passagens` de novo, mantendo TODOS os demais parâmetros.
 *
 * Puro (sem I/O) para ser testável e auditável.
 */
import { cidadeDoAeroporto, interpretarLocal } from "./airport-city";


export type RefineKind =
  | "aeroporto_origem"
  | "aeroporto_destino"
  | "mais_opcoes"
  | "mais_barato"
  | "mais_cedo"
  | "mais_tarde"
  | "sem_conexao"
  | "com_bagagem"
  | "sem_bagagem"
  | "companhia"
  | "outra_data";

export type RefineIntent = {
  kind: RefineKind;
  /** IATA do aeroporto citado (quando kind é aeroporto_*). */
  iata?: string;
  /** Nome amigável do aeroporto/cidade citado. */
  aeroporto?: string;
  /** Companhia citada ("Latam", "Azul", "Gol"). */
  companhia?: string;
};

const semAcento = (s: string): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Aeroportos que o cliente cita pelo nome popular. */
export const AEROPORTOS: Array<{ iata: string; nome: string; termos: string[] }> = [
  { iata: "CGH", nome: "Congonhas", termos: ["congonhas", "cgh"] },
  { iata: "GRU", nome: "Guarulhos", termos: ["guarulhos", "gru", "cumbica"] },
  { iata: "VCP", nome: "Viracopos (Campinas)", termos: ["viracopos", "vcp", "campinas"] },
  { iata: "SDU", nome: "Santos Dumont", termos: ["santos dumont", "santos-dumont", "sdu"] },
  { iata: "GIG", nome: "Galeão", termos: ["galeao", "gig", "tom jobim"] },
  { iata: "CNF", nome: "Confins", termos: ["confins", "cnf", "tancredo neves"] },
  { iata: "PLU", nome: "Pampulha", termos: ["pampulha", "plu"] },
  { iata: "BSB", nome: "Brasília", termos: ["brasilia", "bsb"] },
  { iata: "CWB", nome: "Curitiba (Afonso Pena)", termos: ["afonso pena", "cwb"] },
  { iata: "POA", nome: "Porto Alegre (Salgado Filho)", termos: ["salgado filho", "poa"] },
  { iata: "REC", nome: "Recife (Guararapes)", termos: ["guararapes", "rec"] },
  { iata: "SSA", nome: "Salvador", termos: ["luis eduardo magalhaes", "ssa"] },
  { iata: "FOR", nome: "Fortaleza (Pinto Martins)", termos: ["pinto martins", "for"] },
  { iata: "MGF", nome: "Maringá", termos: ["maringa", "mgf"] },
  { iata: "LDB", nome: "Londrina", termos: ["londrina", "ldb"] },
  { iata: "FLN", nome: "Florianópolis", termos: ["florianopolis", "floripa", "fln"] },
];

const COMPANHIAS: Array<{ nome: string; termos: string[] }> = [
  { nome: "LATAM", termos: ["latam", "tam"] },
  { nome: "Azul", termos: ["azul"] },
  { nome: "Gol", termos: ["gol"] },
];

/** "saindo de", "partindo de", "embarcar em" → o aeroporto citado é a ORIGEM. */
const RX_CONTEXTO_ORIGEM =
  /\b(saindo|sair|partindo|partir|embarcar|embarque|decolando|decolar)\s+(de|do|da|em|por|pelo|pela)\b/i;

const RX_MAIS_OPCOES =
  /\b(tem|teria|ha|há|existe|tens)\s+(mais|outra|outras|algum|alguma|outro)\b|\bmais\s+op(ç|c)(õ|o)es\b|\boutras?\s+(op(ç|c)(õ|o)es|alternativas?)\b|\bmais\s+alguma\s+op(ç|c)(ã|a)o\b|\boutro\s+voo\b|\boutras\s+possibilidades\b/i;
const RX_MAIS_BARATO = /\bmais\s+barat|\bmenor\s+pre(ç|c)o\b|\bmais\s+em\s+conta\b|\bmais\s+econ(ô|o)mic/i;
const RX_MAIS_CEDO = /\bmais\s+cedo\b|\bmais\s+cedinho\b|\bde\s+manh(ã|a)\b|\bpela\s+manh(ã|a)\b|\bantes\s+d[ao]s?\s+\d/i;
const RX_MAIS_TARDE = /\bmais\s+tarde\b|\b(à|a)\s+noite\b|\bno(?:ite|turno)\b|\bdepois\s+d[ao]s?\s+\d/i;
const RX_SEM_CONEXAO = /\bsem\s+(conex(ã|a)o|escala)|\bdiret[oa]s?\b|\bvoo\s+diret/i;
const RX_COM_BAGAGEM = /\bcom\s+(bagagem|mala)\b|\bbagagem\s+despachada\b|\b23\s?kg\b|\bcom\s+despacho\b/i;
const RX_SEM_BAGAGEM = /\bsem\s+(bagagem|mala)\b|\bs(ó|o)\s+bagagem\s+de\s+m(ã|a)o\b/i;
const RX_OUTRA_DATA =
  /\b(outra|outro)\s+(data|dia)\b|\bdata\s+pr(ó|o)xima\b|\bve(r|ja)?\s+p(ra|ara)\s+o?\s?dia\s+\d{1,2}\b|\bno\s+dia\s+\d{1,2}\b|\bdia\s+\d{1,2}(\/\d{1,2})?\b/i;
const RX_OUTRA_CIA = /\boutra\s+(companhia|cia|a(é|e)rea)\b|\boutra\s+empresa\b/i;

/**
 * Detecta TODOS os refinos presentes na mensagem. Retorna vazio quando a
 * mensagem não pede alteração de pesquisa.
 */
export function detectRefineIntents(texto: string): RefineIntent[] {
  const raw = String(texto ?? "");
  const t = semAcento(raw);
  if (!t.trim()) return [];
  const out: RefineIntent[] = [];

  // Aeroporto citado — "tem por Congonhas?", "e por CGH?", "pode ser Viracopos?"
  // A camada de normalização cidade × aeroporto tem prioridade (Congonhas -> CGH).
  const local = interpretarLocal(raw);
  if (local?.tipo === "aeroporto" && local.aeroporto_iata) {
    out.push({
      kind: RX_CONTEXTO_ORIGEM.test(raw) ? "aeroporto_origem" : "aeroporto_destino",
      iata: local.aeroporto_iata,
      aeroporto: local.aeroporto_nome ?? local.aeroporto_iata,
    });
  } else {
    for (const ap of AEROPORTOS) {
      const achou = ap.termos.some((termo) =>
        new RegExp(`(?<![a-z0-9])${termo}(?![a-z0-9])`, "i").test(t),
      );
      if (!achou) continue;
      const origem = RX_CONTEXTO_ORIGEM.test(raw);
      out.push({
        kind: origem ? "aeroporto_origem" : "aeroporto_destino",
        iata: ap.iata,
        aeroporto: ap.nome,
      });
      break;
    }
  }

  if (RX_SEM_CONEXAO.test(t)) out.push({ kind: "sem_conexao" });
  if (RX_SEM_BAGAGEM.test(t)) out.push({ kind: "sem_bagagem" });
  else if (RX_COM_BAGAGEM.test(t)) out.push({ kind: "com_bagagem" });
  if (RX_MAIS_BARATO.test(t)) out.push({ kind: "mais_barato" });
  if (RX_MAIS_CEDO.test(t)) out.push({ kind: "mais_cedo" });
  if (RX_MAIS_TARDE.test(t)) out.push({ kind: "mais_tarde" });
  if (RX_OUTRA_DATA.test(t)) out.push({ kind: "outra_data" });

  if (RX_OUTRA_CIA.test(t)) out.push({ kind: "companhia" });
  else {
    for (const cia of COMPANHIAS) {
      if (cia.termos.some((c) => new RegExp(`(?<![a-z])${c}(?![a-z])`, "i").test(t))) {
        out.push({ kind: "companhia", companhia: cia.nome });
        break;
      }
    }
  }

  if (RX_MAIS_OPCOES.test(t) && !out.length) out.push({ kind: "mais_opcoes" });
  else if (RX_MAIS_OPCOES.test(t) && !out.some((i) => i.kind === "mais_opcoes")) {
    out.unshift({ kind: "mais_opcoes" });
  }

  return out;
}

/** Parâmetros da última pesquisa — base do refino incremental. */
export type RefineBaseSearch = {
  origem: string | null;
  origem_iata: string | null;
  destino: string | null;
  destino_iata: string | null;
  data_ida: string | null;
  data_volta: string | null;
  adultos: number | null;
  criancas: number | null;
  bebes: number | null;
  bagagem_despachada?: boolean | null;
  somente_voo_direto?: boolean | null;
  companhias_incluidas?: string[] | null;
  companhias_excluidas?: string[] | null;
};

const DELTA: Record<RefineKind, (i: RefineIntent) => string> = {
  aeroporto_destino: (i) =>
    `destino = "${i.iata}" (${i.aeroporto}) — o cliente pediu esse aeroporto de CHEGADA. Mantenha origem, data, passageiros e demais filtros.`,
  aeroporto_origem: (i) =>
    `origem = "${i.iata}" (${i.aeroporto}) — o cliente pediu esse aeroporto de EMBARQUE, então origem_informada_pelo_cliente = true. Mantenha destino, data, passageiros e demais filtros.`,
  mais_opcoes: () =>
    `repita a MESMA pesquisa para trazer opções adicionais (as próximas melhores). Não mude nenhum parâmetro.`,
  mais_barato: () => `mesma pesquisa priorizando o MENOR valor.`,
  mais_cedo: () => `preferencia_horario_ida = "manha".`,
  mais_tarde: () => `preferencia_horario_ida = "noite".`,
  sem_conexao: () => `somente_voo_direto = true.`,
  com_bagagem: () => `somente_com_bagagem = true.`,
  sem_bagagem: () => `somente_com_bagagem = false.`,
  companhia: (i) =>
    i.companhia
      ? `companhias_incluidas = ["${i.companhia}"].`
      : `troque a companhia: use companhias_excluidas com a(s) companhia(s) já apresentada(s).`,
  outra_data: () =>
    `use a NOVA data que o cliente informou em data_ida (converta para AAAA-MM-DD). Se ele não disse a data, pergunte antes.`,
};

/**
 * Bloco injetado no prompt: parâmetros da cotação ativa + o que muda +
 * ordem explícita de rodar nova pesquisa antes de qualquer resposta.
 */
export function buildRefineBlock(
  base: RefineBaseSearch | null,
  intents: RefineIntent[],
): string {
  if (!intents.length || !base) return "";

  const params = [
    `origem: ${base.origem ?? "?"}${base.origem_iata ? ` (${base.origem_iata})` : ""}`,
    `destino: ${base.destino ?? "?"}${base.destino_iata ? ` (${base.destino_iata})` : ""}`,
    `data_ida: ${base.data_ida ?? "?"}`,
    base.data_volta ? `data_volta: ${base.data_volta}` : `tipo_trecho: somente_ida`,
    `adultos: ${base.adultos ?? 1}`,
    base.criancas ? `criancas: ${base.criancas}` : null,
    base.bebes ? `bebes: ${base.bebes}` : null,
    base.bagagem_despachada ? `somente_com_bagagem: true` : null,
    base.somente_voo_direto ? `somente_voo_direto: true` : null,
    base.companhias_incluidas?.length
      ? `companhias_incluidas: ${base.companhias_incluidas.join(", ")}`
      : null,
    base.companhias_excluidas?.length
      ? `companhias_excluidas: ${base.companhias_excluidas.join(", ")}`
      : null,
  ].filter(Boolean);

  const deltas = intents.map((i) => `- ${DELTA[i.kind](i)}`);

  return [
    `\n# 🔄 CONTINUAÇÃO DA PESQUISA (o cliente está refinando a cotação ativa)`,
    `A última mensagem NÃO é uma pergunta isolada: é um ajuste da pesquisa que já está em andamento. Trate como pesquisa contínua, igual a um consultor humano.`,
    `\nParâmetros da pesquisa atual (mantenha TODOS, exceto o que muda abaixo):`,
    ...params.map((p) => `- ${p}`),
    `\nO que muda agora:`,
    ...deltas,
    `\nOBRIGATÓRIO: chame pesquisar_passagens AGORA com esses parâmetros (todos os anteriores + a alteração). Você já tem origem, destino, data e passageiros desta cotação — NÃO pergunte de novo e NÃO peça confirmação de origem.`,
    `É PROIBIDO responder "não encontrei", "não tem opção" ou qualquer negativa antes de executar a nova pesquisa. Só depois que a tool devolver sem_resultado você informa que não achou e oferece alternativas (outra data, outro aeroporto próximo, outro horário).`,
    `Nunca encerre o atendimento nem transfira enquanto o cliente estiver ajustando a pesquisa.`,
  ].join("\n");
}
