/**
 * Server function: importa cruise_details a partir de uma URL pública.
 * Uso: admin do editor de pacotes cola o link e recebe o JSON pronto.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: apenas admin");
}

export const importCruiseFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => {
    if (!d?.url || typeof d.url !== "string") throw new Error("URL obrigatória");
    try {
      const u = new URL(d.url);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      throw new Error("URL inválida");
    }
    return d;
  })
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const { extractCruiseFromUrl } = await import("./cruise-import.server");
    return await extractCruiseFromUrl(data.url);
  });
