/**
 * Resumo curto de uma mensagem, usado na lista de conversas e nas notificações.
 * Nunca mostra URL, marcador técnico, transcrição ou leitura automática —
 * apenas "Imagem recebida", "Áudio enviado", etc.
 */

const MEDIA_RE = /\[\[media:(audio|image|video|document|sticker)\|[^\]]*\]\]/i;

type Dir = "inbound" | "outbound" | null | undefined;

function rotulo(kind: string, dir: Dir): string {
  const recebido = dir !== "outbound";
  switch (kind) {
    case "audio":
      return recebido ? "Áudio recebido" : "Áudio enviado";
    case "image":
      return recebido ? "Imagem recebida" : "Imagem enviada";
    case "video":
      return recebido ? "Vídeo recebido" : "Vídeo enviado";
    case "sticker":
      return recebido ? "Figurinha recebida" : "Figurinha enviada";
    default:
      return recebido ? "Documento recebido" : "Documento enviado";
  }
}

export function messagePreview(content: unknown, direction?: Dir): string {
  const texto = typeof content === "string" ? content : content == null ? "" : String(content);
  const m = texto.match(MEDIA_RE);
  if (m) {
    const kind = (m[1] ?? "document").toLowerCase();
    const legenda = texto
      .replace(MEDIA_RE, " ")
      .replace(/\[\[analise-imagem\]\][\s\S]*/i, " ")
      .replace(/🎤 \[áudio transcrito\][\s\S]*/i, " ")
      .replace(/🎤 \[sistema[\s\S]*/i, " ")
      .replace(/(🖼️|🎬|📎|🎤) \[[^\]]*\]/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const label = rotulo(kind, direction);
    return legenda ? `${label} · ${legenda}`.slice(0, 160) : label;
  }
  return texto
    .replace(/\[\[analise-imagem\]\][\s\S]*/i, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
