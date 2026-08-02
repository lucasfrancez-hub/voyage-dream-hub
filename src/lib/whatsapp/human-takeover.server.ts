/**
 * ASSUNÇÃO HUMANA — trava de última hora antes de QUALQUER envio automático.
 *
 * O estado da conversa é relido no banco imediatamente antes de enviar balões,
 * mídias, fallback ou mensagens pendentes. Se um atendente assumiu (mode != ai),
 * pausou a IA (ai_paused) ou a conversa foi atribuída a um humano, o envio
 * automático é cancelado e registramos o motivo.
 *
 * SERVER-ONLY.
 */

export type HumanTakeover = {
  aborted: boolean;
  mode?: string | null;
  ai_paused?: boolean | null;
  human_assigned?: boolean;
};

/** Relê o estado atual da conversa e diz se a IA ainda pode enviar. */
export async function checkHumanTakeover(conversationId: string): Promise<HumanTakeover> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_conversations")
      .select("mode, ai_paused, assigned_to")
      .eq("id", conversationId)
      .maybeSingle();
    if (!data) return { aborted: false };
    const mode = (data as { mode?: string | null }).mode ?? "ai";
    const aiPaused = !!(data as { ai_paused?: boolean | null }).ai_paused;
    const humanAssigned = mode === "human" && !!(data as { assigned_to?: string | null }).assigned_to;
    return {
      aborted: mode !== "ai" || aiPaused || humanAssigned,
      mode,
      ai_paused: aiPaused,
      human_assigned: humanAssigned,
    };
  } catch {
    // Falha ao consultar não pode travar o atendimento: segue o envio.
    return { aborted: false };
  }
}

/** Log padronizado do cancelamento por assunção humana. */
export function logSendAborted(conversationId: string, etapa: string, info?: HumanTakeover): void {
  console.warn(
    `[ai-send] ${JSON.stringify({
      event: "ai_send_aborted_human_takeover",
      conversation_id: conversationId,
      stage: etapa,
      mode: info?.mode ?? null,
      ai_paused: info?.ai_paused ?? null,
      human_assigned: info?.human_assigned ?? null,
      timestamp: new Date().toISOString(),
    })}`,
  );
}

/** Atalho: true quando o envio automático deve ser cancelado. */
export async function abortIfHumanTookOver(
  conversationId: string,
  etapa: string,
): Promise<boolean> {
  const estado = await checkHumanTakeover(conversationId);
  if (estado.aborted) logSendAborted(conversationId, etapa, estado);
  return estado.aborted;
}
