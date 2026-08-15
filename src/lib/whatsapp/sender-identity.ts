/**
 * IDENTIDADE DO REMETENTE das mensagens do chat.
 *
 * `sender` deixou de ser o rótulo genérico "camila": agora guarda o agente REAL
 * que respondeu (bruno, paula, giovani, camila, roberto…), usando `agent_slug`
 * como fonte de verdade. Os três rótulos não-IA continuam iguais e o histórico
 * antigo (tudo gravado como "camila") segue válido — qualquer valor fora dos
 * três reservados é considerado IA.
 *
 * Compartilhado (server + UI).
 */

/** Remetentes que NÃO são IA. */
export const NON_AI_SENDERS = ["customer", "human", "system"] as const;
export type NonAiSender = (typeof NON_AI_SENDERS)[number];

/** Slug usado quando o agente não é conhecido (histórico e fallbacks). */
export const AI_SENDER_FALLBACK = "camila";

export type WaSender = NonAiSender | (string & {});

/** true quando a mensagem foi enviada por um agente de IA. */
export function isAiSender(sender: string | null | undefined): boolean {
  if (!sender) return false;
  return !(NON_AI_SENDERS as readonly string[]).includes(sender);
}

/** Normaliza o slug do agente para gravar em `sender`. */
export function aiSender(agentSlug?: string | null): string {
  const slug = (agentSlug ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!slug || (NON_AI_SENDERS as readonly string[]).includes(slug)) return AI_SENDER_FALLBACK;
  return slug;
}
