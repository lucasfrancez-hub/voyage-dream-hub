import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

const POR_PAGINA = 20;

export const resumoCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const [pacotes, servicos, ultima] = await Promise.all([
      context.supabase.from("comprefacil_pacotes").select("id", { count: "exact", head: true }).eq("ativo", true),
      context.supabase.from("comprefacil_servicos").select("id", { count: "exact", head: true }).eq("ativo", true),
      context.supabase
        .from("comprefacil_import_runs")
        .select("*")
        .order("iniciado_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      pacotes: pacotes.count ?? 0,
      servicos: servicos.count ?? 0,
      ultima: (ultima.data as any) ?? null,
    };
  });

export const listarPacotesCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { busca?: string; pagina?: number; somenteAtivos?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const pagina = Math.max(1, data.pagina ?? 1);
    let q = context.supabase
      .from("comprefacil_pacotes")
      .select(
        "id, externo_id, nome, referencia, cidade, cidade_saida, moeda, valor_servico, valor_taxa, dias, validade_ate, ativo, destaque, sob_pedido, circuito, imagens, periodos",
        { count: "exact" },
      )
      .order("nome");
    if (data.somenteAtivos !== false) q = q.eq("ativo", true);
    if (data.busca?.trim()) {
      const b = `%${data.busca.trim()}%`;
      q = q.or(`nome.ilike.${b},cidade.ilike.${b},referencia.ilike.${b}`);
    }
    const { data: itens, count, error } = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
    if (error) throw new Error(error.message);
    return { itens: (itens as any[]) ?? [], total: count ?? 0, pagina, porPagina: POR_PAGINA };
  });

export const listarServicosCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { busca?: string; tipoId?: number | null; pagina?: number; somenteAtivos?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const pagina = Math.max(1, data.pagina ?? 1);
    let q = context.supabase
      .from("comprefacil_servicos")
      .select("id, externo_id, titulo, tipo, tipo_id, fornecedor, combo, destaque, ativo, internacional", {
        count: "exact",
      })
      .order("titulo");
    if (data.somenteAtivos !== false) q = q.eq("ativo", true);
    if (data.tipoId) q = q.eq("tipo_id", data.tipoId);
    if (data.busca?.trim()) {
      const b = `%${data.busca.trim()}%`;
      q = q.or(`titulo.ilike.${b},fornecedor.ilike.${b}`);
    }
    const { data: itens, count, error } = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
    if (error) throw new Error(error.message);
    return { itens: (itens as any[]) ?? [], total: count ?? 0, pagina, porPagina: POR_PAGINA };
  });

export const detalharPacoteCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { data: pacote, error } = await context.supabase
      .from("comprefacil_pacotes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (pacote as any) ?? null;
  });

export const sincronizarCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { escopo?: "pacotes" | "servicos" | "tudo" }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { importarCompreFacil } = await import("./sync.server");
    return importarCompreFacil(data.escopo ?? "tudo");
  });

/** Motor de busca de pacotes (catálogo + consulta ao vivo na operadora). */
export const buscarPacotesCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: import("./busca.server").FiltrosBuscaCF) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { buscarPacotesCF } = await import("./busca.server");
    return buscarPacotesCF(data);
  });

/** Puxa o pacote direto na operadora e devolve a versão atualizada. */
export const atualizarPacoteCompreFacil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { externoId: number }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { atualizarPacoteAoVivo } = await import("./busca.server");
    const ok = await atualizarPacoteAoVivo(data.externoId);
    const { data: pacote } = await context.supabase
      .from("comprefacil_pacotes")
      .select("*")
      .eq("externo_id", data.externoId)
      .maybeSingle();
    return { ok, pacote: (pacote as any) ?? null };
  });
