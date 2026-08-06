/**
 * Traduz os anexos das DMs do Instagram (áudio, foto, vídeo, reels
 * compartilhado, resposta de story) para algo que o inbox entenda e mostre.
 */

export type AnexoDM = {
  /** image | video | audio | share | story_reply | story_mention | file | text */
  tipo: string;
  /** Mídia direta (CDN da Meta) quando existir. */
  url: string | null;
  /** Texto amigável quando não há mensagem escrita. */
  rotulo: string | null;
};

type AnexoBruto = {
  type?: string;
  payload?: { url?: string; title?: string; reel_video_id?: string };
  image_data?: { url?: string; preview_url?: string };
  video_data?: { url?: string; preview_url?: string };
  file_url?: string;
  title?: string;
  name?: string;
  url?: string;
};

const ROTULOS: Record<string, string> = {
  image: "[Foto]",
  video: "[Vídeo]",
  audio: "[Áudio]",
  file: "[Arquivo]",
  share: "[Publicação compartilhada]",
  ig_reel: "[Reels compartilhado]",
  story_mention: "[Menção no story]",
  story_reply: "[Resposta ao story]",
  animated_image: "[GIF]",
};

function urlDoAnexo(a: AnexoBruto): string | null {
  return (
    a.payload?.url ??
    a.image_data?.url ??
    a.image_data?.preview_url ??
    a.video_data?.url ??
    a.video_data?.preview_url ??
    a.file_url ??
    a.url ??
    null
  );
}

/** Normaliza o anexo de uma mensagem do Direct (webhook ou Graph API). */
export function descreverAnexoDM(input: {
  attachments?: AnexoBruto[] | null;
  /** Resposta a um story: { story: { url, id } }. */
  replyToStory?: { url?: string; id?: string } | null;
  /** shares.data[0] da Graph API (histórico). */
  share?: { link?: string; name?: string } | null;
  text?: string | null;
}): AnexoDM {
  if (input.replyToStory?.url || input.replyToStory?.id) {
    return { tipo: "story_reply", url: input.replyToStory.url ?? null, rotulo: ROTULOS['story_reply']! };
  }

  const a = input.attachments?.[0];
  if (a) {
    const tipo = (a.type ?? (a.video_data ? "video" : a.image_data ? "image" : "file")).toLowerCase();
    const url = urlDoAnexo(a);
    const titulo = a.payload?.title ?? a.title ?? a.name ?? null;
    const base = ROTULOS[tipo] ?? "[Mídia]";
    return { tipo, url, rotulo: titulo ? `${base} ${titulo}` : base };
  }

  if (input.share?.link) {
    return { tipo: "share", url: input.share.link, rotulo: input.share.name ? `${ROTULOS['share']} ${input.share.name}` : ROTULOS['share']! };
  }

  return { tipo: "text", url: null, rotulo: null };
}

/** Rótulo curto para prévias de lista. */
export function previaMensagemDM(text: string | null | undefined, anexo: AnexoDM): string {
  return (text && text.trim()) || anexo.rotulo || "[mensagem]";
}
