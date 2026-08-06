/**
 * Contas do Instagram em que a IA NÃO deve responder.
 *
 * Marcadores em `instagram_accounts.metadata`:
 * - `ai_enabled = false` → IA desligada nessa conta.
 * - `ai_reels_only = true` → mesmo com `ai_enabled = false`, a IA responde
 *   comentários de REELS/vídeo (caso do @lucasfrancez).
 *
 * Quando ausentes, a IA continua ativa (comportamento padrão).
 */
type IgAiMeta = { ai_enabled?: boolean; ai_reels_only?: boolean };

export function contaComIaAtiva(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as IgAiMeta;
  return meta.ai_enabled !== false;
}

export function ehReel(mediaType: string | null | undefined): boolean {
  const t = (mediaType ?? "").toUpperCase();
  return t.includes("VIDEO") || t.includes("REEL");
}

/** Regra final: a IA pode responder este comentário nesta conta? */
export function iaPodeResponderComentario(
  metadata: unknown,
  mediaType: string | null | undefined,
): boolean {
  if (contaComIaAtiva(metadata)) return true;
  const meta = (metadata ?? {}) as IgAiMeta;
  return meta.ai_reels_only === true && ehReel(mediaType);
}
