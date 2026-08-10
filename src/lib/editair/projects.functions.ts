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
        name: z.string().min(1).max(120).default("Projeto sem título"),
        format: Formato.default("custom"),
        width: z.number().int().min(240).max(4096).default(1080),
        height: z.number().int().min(240).max(4096).default(1920),
        fps: z.number().int().min(24).max(60).default(30),
        // Briefings longos são comuns aqui — 4 mil caracteres cortava o texto.
        instructions: z.string().max(100000).optional().nullable(),
        assetIds: z.array(z.string().uuid()).max(30).optional(),
      })
      .parse(input ?? {}),
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
    const id = row.id as string;
    if (data.assetIds?.length) {
      await supabase
        .from("editair_project_assets")
        .upsert(data.assetIds.map((a) => ({ project_id: id, asset_id: a, owner_id: userId })));
    }
    return { id };
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

    // mídias do projeto: legado (project_id) + vínculos com a galeria
    const [legado, vinculos] = await Promise.all([
      supabase.from("editair_assets").select("*").eq("project_id", data.id),
      supabase.from("editair_project_assets").select("asset_id").eq("project_id", data.id),
    ]);
    if (legado.error) throw new Error(legado.error.message);
    const ids = (vinculos.data ?? []).map((v: any) => v.asset_id as string);
    let daGaleria: any[] = [];
    if (ids.length) {
      const { data: rows, error: e3 } = await supabase.from("editair_assets").select("*").in("id", ids);
      if (e3) throw new Error(e3.message);
      daGaleria = rows ?? [];
    }
    const mapa = new Map<string, any>();
    for (const a of [...(legado.data ?? []), ...daGaleria]) mapa.set(a.id as string, a);
    const assets = [...mapa.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return { projeto, assets };
  });

/* ---------------- galeria de mídias (independente de projeto) ---------------- */

export const listarMidiasEditair = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { data, error } = await supabase
      .from("editair_assets")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const vincularMidiaProjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), assetIds: z.array(z.string().uuid()).min(1).max(30) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { error } = await supabase
      .from("editair_project_assets")
      .upsert(data.assetIds.map((a) => ({ project_id: data.projectId, asset_id: a, owner_id: userId })));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const usoDaMidiaEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { data: rows, error } = await supabase
      .from("editair_project_assets")
      .select("project_id")
      .eq("asset_id", data.id);
    if (error) throw new Error(error.message);
    return { projetos: (rows ?? []).length };
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
        projectId: z.string().uuid().optional().nullable(),
        kind: z.string().max(20).default("video"),
        name: z.string().min(1).max(200),
        storagePath: z.string().min(1).max(400),
        thumbPath: z.string().max(400).optional().nullable(),
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
        // a mídia pertence à galeria do usuário; o vínculo com projetos é separado
        project_id: null,
        owner_id: userId,
        kind: data.kind,
        name: data.name,
        storage_path: data.storagePath,
        thumb_path: data.thumbPath ?? null,
        mime: data.mime ?? null,
        size_bytes: data.sizeBytes ?? null,
        duration_ms: data.durationMs ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (data.projectId) {
      await supabase
        .from("editair_project_assets")
        .upsert([{ project_id: data.projectId, asset_id: row.id as string, owner_id: userId }]);
    }
    return row;
  });


export const renomearAssetEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { error } = await supabase.from("editair_assets").update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirAssetEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirAcesso(supabase, userId);
    const { data: row } = await supabase
      .from("editair_assets")
      .select("storage_path,thumb_path")
      .eq("id", data.id)
      .maybeSingle();
    const caminhos = [row?.storage_path, row?.thumb_path].filter(Boolean) as string[];
    if (caminhos.length) {
      await supabase.storage.from("editair-media").remove(caminhos);
    }

    const { error } = await supabase.from("editair_assets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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
