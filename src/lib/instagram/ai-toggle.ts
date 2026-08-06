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

/**
 * Só o perfil principal (VIA AIR) manda o convite no direct depois de
 * responder o comentário. Perfis pessoais (ai_enabled = false) respondem
 * publicamente e param por aí.
 */
export function contaEnviaDmAposComentario(metadata: unknown): boolean {
  return contaComIaAtiva(metadata);
}
