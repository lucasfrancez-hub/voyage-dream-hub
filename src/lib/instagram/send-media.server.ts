/**
 * Envio de mídia em DMs do Instagram.
 *
 * A API do Instagram é bem mais restrita que a do WhatsApp: só aceita anexos
 * de imagem, áudio e vídeo por URL pública, e recusa qualquer outro formato
 * com o erro 2534080 ("This attachment format is not supported").
 * Aqui normalizamos o tipo e, se o anexo for recusado, entregamos o link em
 * texto pra mensagem nunca sumir no caminho.
 */

export type IgMediaKind = "image" | "audio" | "video" | "file";

/**
 * Tipos de áudio que o Instagram aceita como anexo de DM: aac, m4a, mp4 e wav.
 * MP3 (audio/mpeg) NÃO entra nessa lista — a Meta recusa com o erro 2534080,
 * mesmo o Messenger aceitando. Por isso o app grava/converte em WAV.
 */
const AUDIO_OK = /(^|[^\w])(mp4|m4a|aac|wav|x-wav|wave)([^\w]|$)/i;
const VIDEO_OK = /(mp4|quicktime|mov)/i;

export function instagramMediaKind(mime: string, filename = ""): IgMediaKind {
  const alvo = `${mime} ${filename}`;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return AUDIO_OK.test(alvo) ? "audio" : "file";
  if (mime.startsWith("video/")) return VIDEO_OK.test(alvo) ? "video" : "file";
  return "file";
}

export async function sendInstagramMediaSmart(params: {
  igUserId: string;
  token: string;
  recipientIgId: string;
  url: string;
  mime: string;
  filename?: string;
  caption?: string | null;
  bytes?: ArrayBuffer;
}): Promise<{ message_id: string | null; type: IgMediaKind; delivered_as: "attachment" | "link"; error?: string }> {
  const { sendDirectAttachment, sendDirectMessage, uploadInstagramAttachment, sendDirectAttachmentId } =
    await import("./api.server");
  const tipo = instagramMediaKind(params.mime, params.filename ?? "");

  /**
   * Upload direto (multipart) — caminho preferido pra áudio: quando mandamos
   * só a URL, a Meta às vezes responde "Upload failed" (2018007) e o áudio
   * acabava virando link de navegador na DM do cliente.
   */
  const enviarPorUpload = async (): Promise<string | null> => {
    let bytes = params.bytes ?? null;
    if (!bytes) {
      const r = await fetch(params.url);
      if (!r.ok) throw new Error(`Não consegui ler a mídia (${r.status})`);
      bytes = await r.arrayBuffer();
    }
    const attachmentId = await uploadInstagramAttachment({
      igUserId: params.igUserId,
      token: params.token,
      bytes,
      mime: params.mime,
      filename: params.filename || `midia-${Date.now()}`,
      type: tipo,
    });
    const r = (await sendDirectAttachmentId({
      igUserId: params.igUserId,
      token: params.token,
      recipientIgId: params.recipientIgId,
      attachmentId,
      type: tipo,
    })) as { message_id?: string };
    return r.message_id ?? null;
  };

  const enviarLink = async (motivo?: string) => {
    const legenda = params.caption?.trim();
    const texto = `${legenda ? `${legenda}\n` : ""}${params.url}`;
    try {
      const r = await sendDirectMessage({
        igUserId: params.igUserId,
        token: params.token,
        recipientIgId: params.recipientIgId,
        text: texto,
      });
      return { message_id: r.message_id ?? null, type: tipo, delivered_as: "link" as const, ...(motivo ? { error: motivo } : {}) };
    } catch (err) {
      return {
        message_id: null,
        type: tipo,
        delivered_as: "link" as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  if (tipo === "file") return enviarLink("formato não suportado pelo Instagram — enviado como link");

  try {
    const r = (await sendDirectAttachment({
      igUserId: params.igUserId,
      token: params.token,
      recipientIgId: params.recipientIgId,
      url: params.url,
      type: tipo,
    })) as { message_id?: string };
    if (params.caption?.trim()) {
      try {
        await sendDirectMessage({
          igUserId: params.igUserId,
          token: params.token,
          recipientIgId: params.recipientIgId,
          text: params.caption.trim(),
        });
      } catch {
        /* legenda é opcional */
      }
    }
    return { message_id: r.message_id ?? null, type: tipo, delivered_as: "attachment" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[instagram] anexo recusado, caindo pro link:", msg);
    return enviarLink(msg);
  }
}
