import type { PDFDocument, PDFImage } from "pdf-lib";

const isPng = (b: Uint8Array) =>
  b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

/** Converte qualquer formato suportado pelo browser (webp, avif, gif…) em PNG. */
async function toPngBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    if (typeof createImageBitmap !== "function") return null;
    const blob = new Blob([bytes as unknown as BlobPart]);
    const bitmap = await createImageBitmap(blob);
    const canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : Object.assign(document.createElement("canvas"), {
            width: bitmap.width,
            height: bitmap.height,
          });
    const gtx = (canvas as HTMLCanvasElement).getContext("2d");
    if (!gtx) return null;
    gtx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
    const out =
      canvas instanceof OffscreenCanvas
        ? await canvas.convertToBlob({ type: "image/png" })
        : await new Promise<Blob | null>((res) =>
            (canvas as HTMLCanvasElement).toBlob((b) => res(b), "image/png"),
          );
    if (!out) return null;
    return new Uint8Array(await out.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Embute uma imagem no PDF independentemente do formato original.
 * pdf-lib só aceita PNG/JPEG — webp e afins são convertidos antes.
 */
export async function embedImageSmart(
  pdf: PDFDocument,
  bytes: Uint8Array,
): Promise<PDFImage | undefined> {
  try {
    if (isPng(bytes)) return await pdf.embedPng(bytes);
    if (isJpg(bytes)) return await pdf.embedJpg(bytes);
  } catch {
    /* tenta conversão abaixo */
  }
  const png = await toPngBytes(bytes);
  if (!png) return undefined;
  try {
    return await pdf.embedPng(png);
  } catch {
    return undefined;
  }
}
