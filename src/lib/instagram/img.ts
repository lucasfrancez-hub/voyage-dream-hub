/**
 * As URLs do CDN da Meta expiram em poucos dias. Todas as imagens do Instagram
 * passam pelo proxy /api/public/ig-img, que renova o link quando ele vence.
 */
export function igImg(
  url: string | null | undefined,
  ref?: { conversationId?: string | null; mediaId?: string | null; igId?: string | null },
): string | undefined {
  const temRef = Boolean(ref?.conversationId || ref?.mediaId || ref?.igId);
  if (!url && !temRef) return undefined;
  // URLs que não são da Meta não precisam (nem podem) passar pelo proxy.
  if (url && !temRef && !/(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com)$/i.test(safeHost(url))) {
    return url;
  }
  const p = new URLSearchParams();
  if (url) p.set("u", url);
  if (ref?.conversationId) p.set("c", ref.conversationId);
  if (ref?.mediaId) p.set("m", ref.mediaId);
  if (ref?.igId) p.set("p", ref.igId);
  return `/api/public/ig-img?${p.toString()}`;
}

function safeHost(url: string) {
  try {
    return new URL(url, "https://x.invalid").hostname;
  } catch {
    return "";
  }
}
