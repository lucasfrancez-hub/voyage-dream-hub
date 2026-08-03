/**
 * INTERRUPTOR GLOBAL DA IA.
 *
 * Quando desligado, NENHUM agente responde em NENHUMA conversa — nem nas
 * atuais, nem nas que surgirem depois. Todo atendimento passa a ser humano.
 * Vale para o dispatcher com debounce, para o runAgent e para a trava de
 * última hora antes de qualquer envio automático.
 *
 * SERVER-ONLY.
 */

const CACHE_MS = 5_000;
let cache: { value: boolean; at: number } | null = null;

/** true quando as IAs estão liberadas para responder. */
export async function isAiGloballyEnabled(): Promise<boolean> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_ai_switch")
      .select("ai_enabled")
      .eq("id", "global")
      .maybeSingle();
    const value = (data as { ai_enabled?: boolean | null } | null)?.ai_enabled ?? true;
    cache = { value, at: Date.now() };
    return value;
  } catch {
    // Falha de leitura não pode derrubar o atendimento automático.
    return cache?.value ?? true;
  }
}

/** Atalho: true quando o envio automático deve ser cancelado pelo interruptor. */
export async function isAiGloballyOff(): Promise<boolean> {
  return !(await isAiGloballyEnabled());
}

/** Limpa o cache local (usado logo após alternar o interruptor). */
export function resetAiSwitchCache(): void {
  cache = null;
}
