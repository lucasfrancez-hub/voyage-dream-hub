/**
 * Leitura do fluxo de atendimento pelo lado do robô.
 *
 * O mapa desenhado na aba Fluxos vira: (1) bloco de texto no prompt de todos os
 * agentes e (2) roteamento determinístico por palavra-chave, usado ANTES do
 * modelo decidir qualquer coisa.
 *
 * SERVER-ONLY.
 */
import {
  casarPalavrasChave,
  fluxoParaTexto,
  type Flow,
  type FlowMatch,
  type FlowSetor,
} from "./flow";

const SLUG_PADRAO = "roteamento-atendimento";

let cache: { at: number; flow: Flow | null } | null = null;
const TTL_MS = 60_000;

/** Fluxo ativo, com cache curto pra não bater no banco a cada mensagem. */
export async function carregarFluxoAtivo(slug = SLUG_PADRAO): Promise<Flow | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flow;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_flows")
      .select("id, slug, nome, descricao, ativo, versao, nodes, edges, updated_at")
      .eq("slug", slug)
      .eq("ativo", true)
      .maybeSingle();
    const flow = (data as Flow | null) ?? null;
    cache = { at: Date.now(), flow };
    return flow;
  } catch {
    return cache?.flow ?? null;
  }
}

/** Invalida o cache — chamado logo depois de salvar no editor. */
export function invalidarFluxoCache(): void {
  cache = null;
}

/** Bloco pronto pra colar no prompt do agente. Vazio se não houver fluxo. */
export async function blocoFluxoParaPrompt(): Promise<string> {
  const flow = await carregarFluxoAtivo();
  if (!flow || !flow.nodes?.length) return "";
  return fluxoParaTexto(flow);
}

export type RoteamentoFluxo = {
  setor: FlowSetor;
  node_id: string;
  titulo: string;
  matched: string[];
};

/**
 * Roteamento determinístico pelo mapa. Retorna null quando nenhuma
 * palavra-chave bate — nesse caso vale a triagem normal (Consultoria).
 */
export async function rotearPeloFluxo(texto: string): Promise<RoteamentoFluxo | null> {
  const flow = await carregarFluxoAtivo();
  if (!flow) return null;
  const m: FlowMatch | null = casarPalavrasChave(texto, flow.nodes);
  if (!m || !m.setor) return null;
  return { setor: m.setor, node_id: m.node.id, titulo: m.node.data.titulo, matched: m.matched };
}
