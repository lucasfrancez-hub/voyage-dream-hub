import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const listarPacotesCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { busca?: string; fonte?: string; status?: string; pagina?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pagina = data.pagina ?? 0;
    let q = supabaseAdmin
      .from("cativa_pacotes")
      .select(
        "id, fonte, categoria, nome, origem_iata, origem_cidade, destino, data_viagem, data_fim, aereo_por, taxas, valor_total, hoteis, link_orcamento, status, voos_status, voos_opcoes, voos_atualizado_em, voos_erro, visto_em, updated_at",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .range(pagina * 50, pagina * 50 + 49);

    if (data.fonte) q = q.eq("fonte", data.fonte);
    if (data.status) q = q.eq("status", data.status);
    if (data.busca) {
      const b = `%${data.busca}%`;
      q = q.or(`nome.ilike.${b},destino.ilike.${b},origem_iata.ilike.${b},origem_cidade.ilike.${b}`);
    }

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const resumoCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const conta = async (filtro: (q: any) => any) => {
      const { count } = await filtro(supabaseAdmin.from("cativa_pacotes").select("id", { count: "exact", head: true }));
      return count ?? 0;
    };

    const [ativos, esgotados, pendentes, comVoos, erros] = await Promise.all([
      conta((q: any) => q.eq("status", "ativo")),
      conta((q: any) => q.eq("status", "esgotado")),
      conta((q: any) => q.eq("status", "ativo").eq("voos_status", "pendente")),
      conta((q: any) => q.eq("status", "ativo").eq("voos_status", "ok")),
      conta((q: any) => q.eq("voos_status", "erro")),
    ]);

    const { data: runs } = await supabaseAdmin
      .from("cativa_import_runs")
      .select("*")
      .order("iniciado_em", { ascending: false })
      .limit(10);

    return { ativos, esgotados, pendentes, comVoos, erros, runs: runs ?? [] };
  });

export const historicoPacoteCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pacoteId: string }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: hist }, { data: voos }] = await Promise.all([
      supabaseAdmin
        .from("cativa_pacote_historico")
        .select("*")
        .eq("pacote_id", data.pacoteId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("cativa_pacote_voos")
        .select("*")
        .eq("pacote_id", data.pacoteId)
        .order("opcao_numero", { ascending: true }),
    ]);
    return { historico: hist ?? [], voos: voos ?? [] };
  });

export const sincronizarCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planilhas?: boolean; voos?: boolean; limiteVoos?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { rodarCativa } = await import("@/lib/cativa/runner.server");
    return await rodarCativa({
      planilhas: data.planilhas !== false,
      voos: data.voos !== false,
      limiteVoos: data.limiteVoos ?? 15,
    });
  });

export const reprocessarVoosCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pacoteId: string }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("cativa_pacotes")
      .update({
        voos_status: "pendente",
        voos_prioridade: 1,
        voos_tentativas: 0,
        voos_proxima_em: new Date().toISOString(),
      } as any)
      .eq("id", data.pacoteId);
    const { processarFilaVoos } = await import("@/lib/cativa/voos.server");
    return await processarFilaVoos(1);
  });

/** Carrega pacotes selecionados (dados completos + opções de voo) para importar no cadastro. */
export const carregarPacotesCativaParaImportar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const ids = (data.ids ?? []).slice(0, 50);
    if (!ids.length) return { pacotes: [] as any[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: pacotes }, { data: voos }] = await Promise.all([
      supabaseAdmin.from("cativa_pacotes").select("*").in("id", ids),
      supabaseAdmin
        .from("cativa_pacote_voos")
        .select("*")
        .in("pacote_id", ids)
        .order("opcao_numero", { ascending: true }),
    ]);
    let linhas = (voos ?? []) as any[];

    // se os serviços vieram sem descrição (importação antiga), reconsulta a Infotravel
    const semDescricao = [
      ...new Set(
        linhas
          .filter((v) => {
            const d = v.detalhes ?? {};
            const itens = [
              ...(d.transfers ?? []),
              ...(d.tickets ?? []),
              ...(d.activities ?? []),
              ...(d.insurance ?? []),
              ...(d.services ?? []),
            ];
            return itens.length > 0 && !itens.some((i: any) => i?.description);
          })
          .map((v) => v.pacote_id as string),
      ),
    ];
    if (semDescricao.length) {
      const { reprocessarPacotes } = await import("@/lib/cativa/voos.server");
      await reprocessarPacotes(semDescricao);
      const { data: novos } = await supabaseAdmin
        .from("cativa_pacote_voos")
        .select("*")
        .in("pacote_id", ids)
        .order("opcao_numero", { ascending: true });
      linhas = (novos ?? []) as any[];
    }

    // resume com IA as descrições longas dos serviços adicionais (com cache)
    const { resumirServicosEmLote } = await import("@/lib/cativa/servicos-ia.server");
    const resumos = await resumirServicosEmLote(linhas.map((v) => v.detalhes ?? {}));
    linhas.forEach((v, i) => {
      const r = resumos[i];
      if (r && r.length) v.detalhes = { ...(v.detalhes ?? {}), resumo_ia: r };
    });

    const porPacote = new Map<string, any[]>();
    for (const v of linhas) {
      const arr = porPacote.get(v.pacote_id);
      if (arr) arr.push(v);
      else porPacote.set(v.pacote_id, [v]);
    }
    return {
      pacotes: (pacotes ?? []).map((p: any) => ({ pacote: p, voos: porPacote.get(p.id) ?? [] })),
    };
  });
