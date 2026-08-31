/**
 * Origem pública do site para links compartilháveis (WhatsApp, e-mail, etc.).
 * Dentro do preview do editor (id-preview--...lovable.app) e em localhost,
 * usa o domínio de produção — o preview exige login da plataforma para
 * qualquer pessoa fora da equipe.
 */
export function publicOrigin(): string {
  if (typeof window === "undefined") return "https://pedidos.viaair.tur.br";
  const { origin, hostname } = window.location;
  if (hostname.includes("id-preview--") || hostname === "localhost" || hostname === "127.0.0.1") {
    return "https://pedidos.viaair.tur.br";
  }
  return origin;
}
