/**
 * As URLs do CDN da Meta expiram em poucos dias. Todas as imagens do Instagram
 * passam pelo proxy /api/public/ig-img, que renova o link quando ele vence.
 */
export function igImg(
  url: string | null | undefined,
  ref?: { conversationId?: string | null; mediaId?: string | null },
): string | undefined {
  const temRef = Boolean(ref?.conversationId || ref?.mediaId);
  if (!url && !temRef) return undefined;
  const p = new URLSearchParams();
  if (url) p.set("u", url);
  if (ref?.conversationId) p.set("c", ref.conversationId);
  if (ref?.mediaId) p.set("m", ref.mediaId);
  return `/api/public/ig-img?${p.toString()}`;
}
