/**
 * Contas do Instagram em que a IA NÃO deve responder.
 *
 * Marcador: `instagram_accounts.metadata.ai_enabled = false`.
 * Quando ausente, a IA continua ativa (comportamento padrão).
 */
export function contaComIaAtiva(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as { ai_enabled?: boolean };
  return meta.ai_enabled !== false;
}
