/**
 * Leitura e gravação do estado estruturado da conversa. SERVER-ONLY.
 *
 * O estado vive em `wa_conversations.agent_state` e pertence a UM protocolo
 * (`agent_state_protocol_id`). Ao abrir um novo protocolo, o estado é
 * descartado automaticamente — cada atendimento começa limpo.
 */
import { EMPTY_AGENT_STATE, mergeAgentState, normalizeAgentState, type AgentState } from "./state";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadAgentState(conversationId: string): Promise<AgentState> {
  const supabase = await db();
  const { data } = await supabase
    .from("wa_conversations")
    .select("agent_state, agent_state_protocol_id, protocolo_ativo_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return { ...EMPTY_AGENT_STATE };
  const row = data as {
    agent_state?: unknown;
    agent_state_protocol_id?: string | null;
    protocolo_ativo_id?: string | null;
  };
  // Estado de outro protocolo não é reaproveitado.
  if (row.agent_state_protocol_id && row.protocolo_ativo_id && row.agent_state_protocol_id !== row.protocolo_ativo_id) {
    return { ...EMPTY_AGENT_STATE };
  }
  return normalizeAgentState(row.agent_state);
}

/** Aplica um patch (já sanitizado internamente) e devolve o estado resultante. */
export async function applyAgentStatePatch(
  conversationId: string,
  patch: unknown,
): Promise<AgentState> {
  const supabase = await db();
  const atual = await loadAgentState(conversationId);
  const proximo = mergeAgentState(atual, patch);
  const { data } = await supabase
    .from("wa_conversations")
    .select("protocolo_ativo_id")
    .eq("id", conversationId)
    .maybeSingle();
  const protocoloId = (data as { protocolo_ativo_id?: string | null } | null)?.protocolo_ativo_id ?? null;
  await supabase
    .from("wa_conversations")
    .update({ agent_state: proximo, agent_state_protocol_id: protocoloId } as never)
    .eq("id", conversationId);
  return proximo;
}

/** Zera o estado (usado quando um novo protocolo é aberto). */
export async function resetAgentState(conversationId: string, protocoloId: string | null): Promise<void> {
  const supabase = await db();
  await supabase
    .from("wa_conversations")
    .update({ agent_state: EMPTY_AGENT_STATE, agent_state_protocol_id: protocoloId } as never)
    .eq("id", conversationId);
}
