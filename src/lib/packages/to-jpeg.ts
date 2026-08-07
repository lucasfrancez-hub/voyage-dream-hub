/**
 * O Instagram só aceita JPEG nas publicações (PNG é recusado com
 * "Only photo or video can be accepted as media type").
 * Converte qualquer blob de imagem para JPEG antes do upload.
 */
export async function blobToJpeg(blob: Blob, quality = 0.92): Promise<Blob> {
  if (blob.type === "image/jpeg") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  // fundo branco: JPEG não tem transparência
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  return jpeg ?? blob;
}
