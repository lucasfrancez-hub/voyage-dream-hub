/**
 * Server function: importa cruise_details a partir de uma URL pública OU privada
 * (site que exige login — nesse caso o admin cola o header Cookie da própria sessão).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: apenas admin");
}

type Input = {
  url: string;
  /** Cookie completo copiado do DevTools (opcional, pra sites logados). */
  cookie?: string;
};

export const importCruiseFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => {
    if (!d?.url || typeof d.url !== "string") throw new Error("URL obrigatória");
    try {
      const u = new URL(d.url);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      throw new Error("URL inválida");
    }
    const cookie = typeof d.cookie === "string" ? d.cookie.trim() : "";
    return { url: d.url, cookie: cookie || undefined };
  })
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const { extractCruiseFromUrl } = await import("./cruise-import.server");
    return await extractCruiseFromUrl(data.url, data.cookie ? { cookie: data.cookie } : undefined);
  });
