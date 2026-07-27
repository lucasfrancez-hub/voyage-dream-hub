/**
 * Server functions: importa cruise_details a partir de URL da FRT (Krooze),
 * usando cookie salvo no banco ou colado no ato.
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
  /** Cookie completo copiado do DevTools (opcional — se vazio, usa o salvo no banco). */
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
    let cookie = data.cookie;
    if (!cookie) {
      const { data: row } = await context.supabase
        .from("frt_credentials")
        .select("cookie")
        .eq("id", true)
        .maybeSingle();
      cookie = (row?.cookie as string | undefined)?.trim() || undefined;
    }
    if (!cookie) {
      throw new Error(
        "Cookie da FRT não configurado. Vá em Admin → Configurações da FRT pra salvar.",
      );
    }
    const { extractCruiseFromUrl } = await import("./cruise-import.server");
    return await extractCruiseFromUrl(data.url, { cookie });
  });

/** Lê o cookie salvo (admin) — retorna preview curto pra UI. */
export const getFrtCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data } = await context.supabase
      .from("frt_credentials")
      .select("cookie, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (!data) return { hasCookie: false as const };
    const cookie = (data.cookie as string) ?? "";
    return {
      hasCookie: cookie.length > 0,
      preview: cookie.length > 60 ? `${cookie.slice(0, 40)}…${cookie.slice(-20)}` : cookie,
      updated_at: data.updated_at as string,
    };
  });

/** Salva/atualiza o cookie da FRT (admin). */
export const saveFrtCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cookie: string }) => {
    const c = typeof d?.cookie === "string" ? d.cookie.trim() : "";
    if (!c) throw new Error("Cookie obrigatório");
    if (!/kz-token=/i.test(c) && !/JSESSIONID=/i.test(c)) {
      throw new Error(
        "Cookie parece inválido — precisa conter pelo menos kz-token=... ou JSESSIONID=...",
      );
    }
    return { cookie: c };
  })
  .handler(async ({ context, data }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase
      .from("frt_credentials")
      .upsert(
        { id: true, cookie: data.cookie, updated_by: context.userId, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
