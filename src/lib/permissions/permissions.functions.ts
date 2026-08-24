import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MODULO_KEYS } from "./modules";

const GESTOR_EMAIL = "lucas@voeair.com";

export type MeusAcessos = {
  userId: string;
  /** admin e gestor enxergam todos os módulos e todos os dados da equipe */
  verTudo: boolean;
  papeis: string[];
  modulos: string[];
};

/** Módulos e alcance do usuário logado. */
export const meusAcessos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MeusAcessos> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const papeis = (roles ?? []).map((r: any) => String(r.role));
    const email = String((context.claims as any)?.email ?? "").toLowerCase();
    const verTudo = papeis.includes("admin") || papeis.includes("gestor") || email === GESTOR_EMAIL;

    const { data: mods } = await supabaseAdmin
      .from("user_modules")
      .select("module_key")
      .eq("user_id", context.userId);

    return {
      userId: context.userId,
      verTudo,
      papeis,
      modulos: verTudo ? MODULO_KEYS : (mods ?? []).map((m: any) => String(m.module_key)),
    };
  });

async function ensureGestor(ctx: { claims: any }) {
  const email = String(ctx.claims?.email ?? "").toLowerCase();
  if (email !== GESTOR_EMAIL) throw new Error("Apenas o gestor pode gerenciar permissões.");
}

/** Módulos liberados de um usuário (visão do gestor). */
export const listarModulosUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<string[]> => {
    await ensureGestor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mods, error } = await supabaseAdmin
      .from("user_modules")
      .select("module_key")
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return (mods ?? []).map((m: any) => String(m.module_key));
  });

/** Grava a lista completa de módulos de um usuário. */
export const salvarModulosUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        modulos: z.array(z.string().min(1).max(60)).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    const validos = data.modulos.filter((m) => MODULO_KEYS.includes(m));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: delErr } = await supabaseAdmin
      .from("user_modules")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);

    if (validos.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_modules")
        .insert(validos.map((m) => ({ user_id: data.userId, module_key: m })));
      if (error) throw new Error(error.message);
    }
    return { ok: true as const, total: validos.length };
  });
