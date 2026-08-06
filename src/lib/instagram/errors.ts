/** Traduz erros crus da Graph API em mensagens legíveis para a equipe. */

/** Graph devolve code 100 / subcode 33 quando o objeto não pertence à conta (posts em collab). */
export function ehObjetoDeOutroPerfil(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro ?? "");
  return (
    /error_subcode"?:\s*33/.test(msg) ||
    /does not exist, cannot be loaded due to missing permissions/i.test(msg)
  );
}

export function mensagemAmigavelInstagram(erro: unknown, acao: string): string {
  if (ehObjetoDeOutroPerfil(erro)) {
    return `Não foi possível ${acao}: essa publicação é de outro perfil (colaboração). O Instagram só libera essa ação para o perfil que publicou — faça direto pelo app do Instagram.`;
  }
  const msg = erro instanceof Error ? erro.message : String(erro ?? "");
  if (/\(#?190\)|OAuthException/i.test(msg)) {
    return `Não foi possível ${acao}: a conexão com o Instagram expirou. Reconecte a conta em Configurações.`;
  }
  if (/rate limit|#4\b|#17\b/i.test(msg)) {
    return `Não foi possível ${acao}: limite de requisições do Instagram atingido. Tente novamente em alguns minutos.`;
  }
  return `Não foi possível ${acao}. ${msg}`.trim();
}
