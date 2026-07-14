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

export type AdminRole = "admin" | "user" | "partner";

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  role: AdminRole;
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
    // Prioridade: admin > partner > user
    const rank: Record<AdminRole, number> = { admin: 3, partner: 2, user: 1 };
    const roleMap = new Map<string, AdminRole>();
    (roles ?? []).forEach((r: any) => {
      const cur = roleMap.get(r.user_id);
      const next = r.role as AdminRole;
      if (!cur || rank[next] > rank[cur]) roleMap.set(r.user_id, next);
    });

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name");
    const nameMap = new Map<string, string | null>();
    (profiles ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name ?? null));

    return (data.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      fullName: nameMap.get(u.id) ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      emailConfirmedAt: (u as any).email_confirmed_at ?? null,
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
        role: z.enum(["admin", "user", "partner"]),
        fullName: z.string().trim().max(120).optional(),
        agencyName: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    if (data.role === "partner" && !data.agencyName) {
      throw new Error("Informe o nome da empresa para o usuário terceiro.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Cria o usuário já com e-mail confirmado e a senha temporária definida
    // pelo gestor (não depende de entrega de e-mail).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.fullName ? { full_name: data.fullName } : undefined,
    });
    if (createErr) throw new Error(createErr.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("Falha ao criar usuário");
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const hasRequested = (existing ?? []).some((r: any) => r.role === data.role);
    if (!hasRequested) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    }
    if (data.fullName) {
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: userId, full_name: data.fullName });
    }
    if (data.role === "partner" && data.agencyName) {
      await supabaseAdmin
        .from("partner_agencies")
        .upsert({ user_id: userId, agency_name: data.agencyName }, { onConflict: "user_id" });
    }
    return { id: userId, email: created.user!.email ?? data.email };
  });

export const setAdminUserFullName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        fullName: z.string().trim().max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const name = data.fullName.length > 0 ? data.fullName : null;
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: data.userId, full_name: name });
    if (error) throw new Error(error.message);
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      user_metadata: { full_name: name },
    });
    return { ok: true };
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
        role: z.enum(["admin", "user", "partner"]),
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

export const resendUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Dispara e-mail de recuperação de senha (template padrão da Lovable).
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmAdminUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAdminUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(8).max(72),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureGestor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
