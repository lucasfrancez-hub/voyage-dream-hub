import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Flow, FlowEdge, FlowNode } from "@/lib/whatsapp/flow";

/** Lista os fluxos de atendimento (mapa do chat). */
export const listFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
    const { data, error } = await sb
      .from("wa_flows")
      .select("id, slug, nome, descricao, ativo, versao, nodes, edges, updated_at, updated_by")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Flow[];
  });

/** Salva o desenho do fluxo (quadros, setas e palavras-chave). */
export const saveFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; nodes: FlowNode[]; edges: FlowEdge[]; nome?: string; descricao?: string | null; ativo?: boolean }) => {
    if (!d?.id) throw new Error("id é obrigatório");
    if (!Array.isArray(d.nodes) || !Array.isArray(d.edges)) throw new Error("nodes/edges inválidos");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as never as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => {
            select: (s: string) => {
              maybeSingle: () => Promise<{ data: { id: string; versao: number; updated_at: string } | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
    const patch: Record<string, unknown> = {
      // Guarda só o que o robô entende — nada de estado visual do editor.
      nodes: data.nodes.map((n) => ({
        id: n.id,
        type: "fluxo",
        position: n.position,
        data: {
          titulo: n.data?.titulo ?? "",
          tipo: n.data?.tipo ?? "acao",
          setor: n.data?.setor ?? null,
          descricao: n.data?.descricao ?? "",
          keywords: (n.data?.keywords ?? []).map((k) => String(k).trim()).filter(Boolean),
        },
      })),
      edges: data.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label ?? "" })),
      updated_by: (context as { claims?: { email?: string } }).claims?.email ?? null,
    };
    if (data.nome !== undefined) patch.nome = data.nome;
    if (data.descricao !== undefined) patch.descricao = data.descricao;
    if (data.ativo !== undefined) patch.ativo = data.ativo;

    const { data: row, error } = await sb
      .from("wa_flows")
      .update(patch)
      .eq("id", data.id)
      .select("id, versao, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // O robô lê o mapa com cache de 1 min; derruba na hora após salvar.
    const { invalidarFluxoCache } = await import("@/lib/whatsapp/flow.server");
    invalidarFluxoCache();
    return row ?? null;
  });
