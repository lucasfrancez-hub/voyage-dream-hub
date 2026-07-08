import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GESTOR_EMAIL = "lucas@voeair.com";

async function ensureGestor(ctx: { supabase: any; userId: string; claims: any }) {
  const email = String(ctx.claims?.email ?? "").toLowerCase();
  if (email !== GESTOR_EMAIL) {
    throw new Error("Apenas o gestor pode gerenciar usuários.");
  }
}

export type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  role: "admin" | "user";
};

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await ensureGestor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(error.message);

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);
    const roleMap = new Map<string, "admin" | "user">();
    (roles ?? []).forEach((r: any) => {
      // admin wins over user
      if (r.role === "admin" || !roleMap.has(r.user_id)) {
        roleMap.set(r.user_id, r.role);
      }
    });

    return (data.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      role: roleMap.get(u.id) ?? "user",
    }));
  });

export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(72),
        role: z.enum(["admin", "user"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("Falha ao criar usuário");
    // Reconciliar role: o trigger handle_new_user_role já insere 'user' (ou 'admin' se for o 1º).
    // Se pedido diferente do atual, ajustar.
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const hasRequested = (existing ?? []).some((r: any) => r.role === data.role);
    if (!hasRequested) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    }
    return { id: userId, email: created.user!.email ?? data.email };
  });

export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    if (data.userId === context.userId) {
      throw new Error("Você não pode remover sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAdminUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "user"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Substitui roles do usuário pela role solicitada
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
