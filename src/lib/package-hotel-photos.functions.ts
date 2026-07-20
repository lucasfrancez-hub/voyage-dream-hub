import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "package-hotel-photos";
const MAX_PHOTOS = 5;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const persistSchema = z.object({
  packageId: z.string().uuid().optional(),
  photos: z.array(z.string().url()).max(MAX_PHOTOS),
});

function extensionFor(contentType: string, url: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("avif")) return "avif";
  if (contentType.includes("gif")) return "gif";
  const match = new URL(url).pathname.match(/\.(jpe?g|png|webp|avif|gif)$/i);
  return match?.[1]?.toLowerCase().replace("jpeg", "jpg") ?? "jpg";
}

function isStoredPhoto(url: string) {
  return url.includes(`/api/public/package-hotel-photo/`);
}

export const persistPackageHotelPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => persistSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Sem permissão para salvar fotos de pacotes.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folder = data.packageId ?? crypto.randomUUID();
    const persisted: string[] = [];

    for (const [index, url] of data.photos.slice(0, MAX_PHOTOS).entries()) {
      if (isStoredPhoto(url)) {
        persisted.push(url);
        continue;
      }

      try {
        const response = await fetch(url, {
          headers: {
            Accept: "image/*,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (compatible; ViaAirHotelPhotos/1.0; +https://viaair.tur.br)",
          },
          redirect: "follow",
        });
        if (!response.ok) continue;
        const contentType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0];
        if (!contentType.startsWith("image/")) continue;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) continue;

        const path = `${folder}/${index + 1}.${extensionFor(contentType, url)}`;
        const { error } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType, upsert: true, cacheControl: "31536000" });
        if (!error) persisted.push(`/api/public/package-hotel-photo/${path}`);
      } catch (error) {
        console.warn("[package-hotel-photos] falha ao persistir foto", error);
      }
    }

    if (data.packageId && persisted.length > 0) {
      const { error } = await supabaseAdmin
        .from("packages")
        .update({ tripadvisor_photos: persisted })
        .eq("id", data.packageId);
      if (error) throw new Error(error.message);
    }

    return { photos: persisted };
  });