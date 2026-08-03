/**
 * FLUXO DE ATENDIMENTO — modelo compartilhado (client + server).
 *
 * O mapa desenhado na aba Fluxos do chat é a FONTE DE VERDADE do roteamento:
 * quem atende o quê, quando transfere e com quais palavras-chave. Este arquivo
 * só tem regras puras (sem I/O) pra poder rodar no editor e no worker da IA.
 */

export type FlowNodeTipo = "inicio" | "condicao" | "intencao" | "acao" | "setor" | "regra";

/** Setor responsável — casa com o roteamento real do chatbot. */
export type FlowSetor = "aereo" | "consultoria" | "comercial" | null;

/** O que o quadro dispara quando o atendimento passa por ele. */
export type FlowAcaoTipo =
  | "mensagem"
  | "pergunta"
  | "pesquisar_voos"
  | "enviar_cards"
  | "buscar_pacotes"
  | "transferir"
  | "abrir_protocolo"
  | "encerrar_protocolo"
  | "notificar_humano"
  | "aguardar"
  | "tag";

export type FlowAcao = {
  id: string;
  tipo: FlowAcaoTipo;
  /** Texto livre: o que exatamente a IA faz/dispara aqui. */
  detalhe: string;
};

export type FlowNodeData = {
  titulo: string;
  tipo: FlowNodeTipo;
  setor: FlowSetor;
  descricao: string;
  /** Gatilhos textuais que levam a este caminho. */
  keywords: string[];
  /** Ações/disparos executados neste ponto (opcional). */
  acoes?: FlowAcao[];
};

export type FlowNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: FlowNodeData;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type Flow = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  versao: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  updated_at?: string;
};

export const SETOR_LABEL: Record<string, string> = {
  aereo: "Setor Aéreo (Paula ou Bruno)",
  consultoria: "Consultoria (Camila, Maria, Roberto, Giovani…)",
  comercial: "Comercial (humano)",
};

export const TIPO_LABEL: Record<FlowNodeTipo, string> = {
  inicio: "Início",
  condicao: "Condição",
  intencao: "Intenção do cliente",
  acao: "Ação",
  setor: "Setor",
  regra: "Regra",
};

export const ACAO_LABEL: Record<FlowAcaoTipo, string> = {
  mensagem: "Enviar mensagem",
  pergunta: "Perguntar ao cliente",
  pesquisar_voos: "Pesquisar voos",
  enviar_cards: "Enviar cards de cotação",
  buscar_pacotes: "Buscar pacotes",
  transferir: "Transferir de setor",
  abrir_protocolo: "Abrir protocolo",
  encerrar_protocolo: "Encerrar protocolo",
  notificar_humano: "Notificar humano",
  aguardar: "Aguardar resposta",
  tag: "Marcar etiqueta",
};

/** Mesma normalização da triagem: sem acento, minúsculo, letras repetidas. */
export function normalizar(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export type FlowMatch = {
  node: FlowNode;
  setor: FlowSetor;
  /** Palavras-chave que bateram, da mais específica pra menos. */
  matched: string[];
};

/**
 * Casa o texto do cliente com as palavras-chave do mapa.
 * Ganha o nó com o gatilho mais específico (palavra-chave mais longa) — assim
 * "aéreo + hotel" cai em pacote, e não em aéreo.
 */
export function casarPalavrasChave(texto: string, nodes: FlowNode[]): FlowMatch | null {
  const alvo = normalizar(texto);
  if (!alvo) return null;

  let melhor: FlowMatch | null = null;
  let melhorPeso = 0;

  for (const n of nodes) {
    const kws = (n.data?.keywords ?? []).filter(Boolean);
    if (!kws.length) continue;
    const matched: string[] = [];
    let peso = 0;
    for (const kw of kws) {
      const k = normalizar(kw);
      if (!k) continue;
      // limite de palavra pra "voo" não casar dentro de "voou de raiva"
      const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
      if (re.test(alvo)) {
        matched.push(kw);
        peso = Math.max(peso, k.length);
      }
    }
    if (matched.length && peso > melhorPeso) {
      melhorPeso = peso;
      melhor = { node: n, setor: n.data?.setor ?? null, matched };
    }
  }
  return melhor;
}

/**
 * Converte o mapa em texto pra IA. É isso que entra no prompt: o desenho da
 * equipe vira instrução literal, sem ninguém precisar reescrever prompt.
 */
export function fluxoParaTexto(flow: Pick<Flow, "nome" | "nodes" | "edges">): string {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const linhas: string[] = [];
  linhas.push(`🗺️ ${flow.nome.toUpperCase()} (mapa oficial — obedecer à risca)`);

  for (const n of flow.nodes) {
    const d = n.data;
    const saidas = flow.edges
      .filter((e) => e.source === n.id)
      .map((e) => {
        const alvo = byId.get(e.target);
        const rotulo = e.label ? ` (${e.label})` : "";
        return `${alvo?.data?.titulo ?? e.target}${rotulo}`;
      });

    const partes: string[] = [`• ${d.titulo} [${TIPO_LABEL[d.tipo] ?? d.tipo}]`];
    if (d.setor) partes.push(`  → responsável: ${SETOR_LABEL[d.setor] ?? d.setor}`);
    if (d.descricao) partes.push(`  → ${d.descricao}`);
    if (d.keywords?.length) partes.push(`  → gatilhos: ${d.keywords.join(", ")}`);
    if (saidas.length) partes.push(`  → segue para: ${saidas.join(" | ")}`);
    linhas.push(partes.join("\n"));
  }

  linhas.push(
    "REGRA: nunca atender fora do seu setor no mapa. Quando o pedido pertencer a outro setor, transferir conforme as setas — sem devolver a decisão ao cliente.",
  );
  return linhas.join("\n");
}

/** Validação leve usada antes de salvar no editor. */
export function validarFluxo(nodes: FlowNode[], edges: FlowEdge[]): string[] {
  const erros: string[] = [];
  const ids = new Set(nodes.map((n) => n.id));
  if (!nodes.length) erros.push("O fluxo precisa de pelo menos um quadro.");
  if (nodes.some((n) => !n.data?.titulo?.trim())) erros.push("Todo quadro precisa de um título.");
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) erros.push(`Seta ${e.id} aponta pra um quadro que não existe.`);
  }
  const orfaos = nodes.filter(
    (n) => n.data?.tipo !== "inicio" && !edges.some((e) => e.target === n.id) && !edges.some((e) => e.source === n.id),
  );
  if (orfaos.length) erros.push(`Sem ligação: ${orfaos.map((n) => n.data.titulo).join(", ")}.`);
  return erros;
}
