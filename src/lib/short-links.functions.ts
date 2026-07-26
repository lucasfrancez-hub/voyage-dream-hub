import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/i;
const RESERVED = new Set(["admin", "api", "auth", "chat", "l", "s", "ir"]);

function randomSlug(len = 6): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito");
}

export const listShortLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("short_links")
      .select("slug,target_url,label,click_count,created_at,last_click_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createShortLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        target_url: z.string().url().max(2048),
        slug: z.string().trim().max(60).optional().nullable(),
        label: z.string().trim().max(120).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    let slug = (data.slug || "").trim().toLowerCase();
    if (slug) {
      if (!SLUG_RE.test(slug) || RESERVED.has(slug)) {
        throw new Error("Slug inválido. Use letras, números e hífen.");
      }
    } else {
      // gerar único (com retry)
      for (let i = 0; i < 6; i++) {
        const candidate = randomSlug(6 + Math.floor(i / 2));
        const { data: existing } = await context.supabase
          .from("short_links")
          .select("slug")
          .eq("slug", candidate)
          .maybeSingle();
        if (!existing) {
          slug = candidate;
          break;
        }
      }
      if (!slug) throw new Error("Falha ao gerar slug único");
    }

    const { error } = await context.supabase.from("short_links").insert({
      slug,
      target_url: data.target_url,
      label: data.label || null,
      created_by: context.userId,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Esse slug já está em uso.");
      throw new Error(error.message);
    }
    return { slug };
  });

export const deleteShortLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("short_links")
      .delete()
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
