import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic"]);
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Anonymous checkout boleto document upload. Runs server-side using the admin
 * client so we can drop the public storage INSERT policy. Validates size/type
 * and generates a random path — no client-supplied path is trusted.
 */
export const uploadBoletoDocument = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        filename: z.string().min(1).max(255),
        contentType: z.string().max(120).optional().nullable(),
        // base64 (no data-uri prefix)
        base64: z.string().min(1).max(20_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const rawExt = (data.filename.split(".").pop() ?? "").toLowerCase();
    const ext = ALLOWED_EXT.has(rawExt) ? rawExt : "bin";
    const contentType =
      data.contentType && ALLOWED_TYPES.has(data.contentType)
        ? data.contentType
        : undefined;
    if (ext === "bin" && !contentType) {
      throw new Error("Formato de arquivo não suportado.");
    }

    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength === 0) throw new Error("Arquivo vazio.");
    if (bytes.byteLength > MAX_BYTES) throw new Error("Arquivo muito grande (máx. 10 MB).");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("boleto-documents")
      .upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(error.message);
    return { path };
  });
