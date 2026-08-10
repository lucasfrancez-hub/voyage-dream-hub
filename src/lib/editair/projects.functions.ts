/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Formato = z.enum(["vertical", "feed", "horizontal", "quadrado", "custom"]);

async function garantirAcesso(supabase: any, userId: string) {
  const [admin, marketing] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "marketing" }),
  ]);
  if (admin.error) throw new Error(admin.error.message);
  if (!admin.data && !marketing.data) throw new Error("Sem permissão para usar o EditAir");
  return { ehAdmin: Boolean(admin.data) };
}


export const listarProjetosEditair = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { data, error } = await supabase
      .from("editair_projects")
      .select("id,name,format,width,height,fps,status,stats,updated_at,created_at")
      .order("updated_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const criarProjetoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        format: Formato,
        width: z.number().int().min(240).max(4096),
        height: z.number().int().min(240).max(4096),
        fps: z.number().int().min(24).max(60).default(30),
        instructions: z.string().max(4000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { data: row, error } = await supabase
      .from("editair_projects")
      .insert({
        owner_id: userId,
        name: data.name,
        format: data.format,
        width: data.width,
        height: data.height,
        fps: data.fps,
        instructions: data.instructions ?? null,
        status: "importando",
        state: {},
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const obterProjetoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { data: projeto, error } = await supabase
      .from("editair_projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!projeto) throw new Error("Projeto não encontrado");
    const { data: assets, error: e2 } = await supabase
      .from("editair_assets")
      .select("*")
      .eq("project_id", data.id)
      .order("created_at", { ascending: true });
    if (e2) throw new Error(e2.message);
    return { projeto, assets: assets ?? [] };
  });

export const salvarEstadoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        state: z.unknown().optional(),
        transcript: z.unknown().optional(),
        stats: z.unknown().optional(),
        status: z.string().max(40).optional(),
        name: z.string().min(1).max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const patch: Record<string, unknown> = {};
    if (data.state !== undefined) patch.state = data.state;
    if (data.transcript !== undefined) patch.transcript = data.transcript;
    if (data.stats !== undefined) patch.stats = data.stats;
    if (data.status !== undefined) patch.status = data.status;
    if (data.name !== undefined) patch.name = data.name;
    const { error } = await supabase.from("editair_projects").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, savedAt: new Date().toISOString() };
  });

export const excluirProjetoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { error } = await supabase.from("editair_projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const registrarAssetEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        kind: z.string().max(20).default("video"),
        name: z.string().min(1).max(200),
        storagePath: z.string().min(1).max(400),
        mime: z.string().max(120).optional().nullable(),
        sizeBytes: z.number().int().nonnegative().optional().nullable(),
        durationMs: z.number().int().nonnegative().optional().nullable(),
        width: z.number().int().nonnegative().optional().nullable(),
        height: z.number().int().nonnegative().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { data: row, error } = await supabase
      .from("editair_assets")
      .insert({
        project_id: data.projectId,
        owner_id: userId,
        kind: data.kind,
        name: data.name,
        storage_path: data.storagePath,
        mime: data.mime ?? null,
        size_bytes: data.sizeBytes ?? null,
        duration_ms: data.durationMs ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const registrarEventoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        actor: z.enum(["ia", "usuario"]).default("ia"),
        message: z.string().min(1).max(600),
        ops: z.unknown().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { error } = await supabase.from("editair_ai_events").insert({
      project_id: data.projectId,
      owner_id: userId,
      actor: data.actor,
      message: data.message,
      ops: (data.ops ?? null) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listarEventosEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { data: rows, error } = await supabase
      .from("editair_ai_events")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
