/**
 * TRAVA DE MENSAGEM DUPLICADA.
 *
 * Regra do negócio: a IA NUNCA pode mandar duas vezes a mesma mensagem pro
 * cliente. Se a resposta gerada for igual (ou praticamente igual) a algo que
 * já saiu neste protocolo, o envio é cancelado EM SILÊNCIO e a conversa vai
 * direto pro atendimento humano — sem avisar o cliente, sem "desculpa",
 * sem repetir a pergunta.
 *
 * SERVER-ONLY.
 */

/** Normaliza pra comparação: sem acento, sem pontuação, sem nome do agente. */
export function normalizeForDuplicate(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*[a-z]{2,20}\s*:\s*/i, "") // prefixo "Bruno: "
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** true quando o texto novo repete algo já enviado. */
export function isDuplicateText(novo: string, anteriores: string[]): boolean {
  const alvo = normalizeForDuplicate(novo);
  if (alvo.length < 12) return false; // "ok", "perfeito" podem repetir
  return anteriores.some((a) => normalizeForDuplicate(a) === alvo);
}

/**
 * Lê os últimos balões enviados no protocolo e diz se a resposta repete.
 */
export async function wouldDuplicate(input: {
  conversationId: string;
  protocolId?: string | null;
  text: string;
  limit?: number;
}): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("wa_messages")
      .select("content")
      .eq("conversation_id", input.conversationId)
      .eq("direction", "outbound")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 20);
    if (input.protocolId) q = q.eq("protocolo_id", input.protocolId);
    const { data } = await q;
    const anteriores = (data ?? [])
      .map((m) => (m as { content?: string | null }).content ?? "")
      .filter(Boolean);
    return isDuplicateText(input.text, anteriores);
  } catch {
    return false; // consulta falhou não pode travar o atendimento
  }
}

/**
 * Cancela o envio e joga pro humano, sem mandar nada pro cliente.
 */
export async function escalarPorDuplicidade(input: {
  conversationId: string;
  protocolId?: string | null;
  agentSlug: string;
  texto: string;
  tags?: string[] | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tags = Array.from(new Set([...(input.tags ?? []), "aguardando_humano", "mensagem_duplicada"]));
  await supabaseAdmin
    .from("wa_conversations")
    .update({
      tags,
      priority: "high",
      assigned_to: null,
      ai_paused: true,
      ai_debounce_until: null,
    })
    .eq("id", input.conversationId);

  try {
    const { recordHandoff, saveMessage } = await import("./conversation.server");
    await recordHandoff({
      conversation_id: input.conversationId,
      from_mode: "ai",
      to_mode: "human",
      reason: "mensagem_duplicada",
      briefing:
        `A IA (${input.agentSlug}) ia repetir uma mensagem já enviada neste protocolo. ` +
        `Envio cancelado e IA pausada. Texto bloqueado: "${input.texto.slice(0, 300)}"`,
    }).catch(() => {});
    await saveMessage({
      conversation_id: input.conversationId,
      direction: "outbound",
      sender: "system",
      content: "⚠️ nota interna: resposta duplicada bloqueada — conversa passada para atendimento humano.",
    }).catch(() => {});
  } catch {
    /* noop */
  }

  console.warn(
    "[ai-send]",
    JSON.stringify({
      event: "ai_send_blocked_duplicate",
      conversation_id: input.conversationId,
      agent_slug: input.agentSlug,
    }),
  );
}
