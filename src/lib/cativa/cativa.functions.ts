import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const CATEGORIA_CIRCUITO = "Circuito";

/**
 * Pacote "incompleto": falta destino, falta origem (fora circuito) ou a fila de
 * voos ainda não concluiu. Quando os voos vieram ok, aéreo e taxas saem das
 * opções importadas — por isso não entram mais nessa checagem (evita marcar
 * como incompleto pacote que na verdade está completo).
 */
const FILTRO_INCOMPLETO = [
  "destino.is.null",
  `and(origem_iata.is.null,voos_status.neq.circuito)`,
  "and(voos_status.neq.ok,voos_status.neq.circuito)",
].join(",");

/** Pacote pronto pro Command Center: completo ou liberado manualmente. */
const FILTRO_COMPLETO = `liberado_manual.is.true,and(destino.not.is.null,or(voos_status.eq.ok,voos_status.eq.circuito))`;


export const listarPacotesCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      input:
        | {
            busca?: string;
            fonte?: string;
            status?: string;
            pagina?: number;
            arquivados?: boolean;
            /** "circuitos" mostra só circuitos; por padrão circuitos ficam fora da lista */
            modo?: "pacotes" | "circuitos" | "todos";
            /** só pacotes com dados faltando (origem, destino, aéreo ou taxas) */
            incompletos?: boolean;
            /** só pacotes completos: origem, destino, taxas, aéreo e fila de voos concluída */
            somenteCompletos?: boolean;
          }
        | undefined,
    ) => input ?? {},
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pagina = data.pagina ?? 0;
    let q = supabaseAdmin
      .from("cativa_pacotes")
      .select(
        "id, fonte, categoria, nome, origem_iata, origem_cidade, destino, data_viagem, data_fim, aereo_por, taxas, valor_total, hoteis, link_orcamento, status, voos_status, voos_opcoes, voos_atualizado_em, voos_erro, visto_em, updated_at, importado_em, liberado_manual",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .range(pagina * 50, pagina * 50 + 49);

    // pacotes já importados ficam arquivados e só aparecem quando pedido
    q = data.arquivados ? q.not("importado_em", "is", null) : q.is("importado_em", null);
    const modo = data.modo ?? "pacotes";
    if (modo === "circuitos") q = q.eq("categoria", CATEGORIA_CIRCUITO);
    else if (modo === "pacotes") q = q.or(`categoria.is.null,categoria.neq.${CATEGORIA_CIRCUITO}`);
    if (data.incompletos) q = q.eq("liberado_manual", false).or(FILTRO_INCOMPLETO);
    if (data.somenteCompletos && !data.incompletos) q = q.or(FILTRO_COMPLETO);

    if (data.fonte) q = q.eq("fonte", data.fonte);
    if (data.status) q = q.eq("status", data.status);
    if (data.busca) {
      const b = `%${data.busca}%`;
      q = q.or(`nome.ilike.${b},destino.ilike.${b},origem_iata.ilike.${b},origem_cidade.ilike.${b}`);
    }


    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    // menor total entre as opções de voo importadas (usado quando o aéreo veio vazio)
    const lista = (rows ?? []) as any[];
    if (lista.length) {
      const { data: voos } = await supabaseAdmin
        .from("cativa_pacote_voos")
        .select("pacote_id, total")
        .in(
          "pacote_id",
          lista.map((p) => p.id),
        );
      const menor = new Map<string, number>();
      for (const v of (voos ?? []) as any[]) {
        const t = Number(v.total);
        if (!Number.isFinite(t) || t <= 0) continue;
        const atual = menor.get(v.pacote_id);
        if (atual === undefined || t < atual) menor.set(v.pacote_id, t);
      }
      for (const p of lista) p.voo_menor = menor.get(p.id) ?? null;
    }

    return { rows: lista, total: count ?? 0 };
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

    const semCircuito = (q: any) => q.or(`categoria.is.null,categoria.neq.${CATEGORIA_CIRCUITO}`);
    const [ativos, esgotados, pendentes, comVoos, erros, circuitos, incompletos] = await Promise.all([
      conta((q: any) => semCircuito(q.eq("status", "ativo").is("importado_em", null))),
      conta((q: any) => q.eq("status", "esgotado")),
      conta((q: any) => semCircuito(q.eq("status", "ativo").eq("voos_status", "pendente"))),
      conta((q: any) => semCircuito(q.eq("status", "ativo").eq("voos_status", "ok"))),
      conta((q: any) => semCircuito(q.eq("voos_status", "erro"))),
      conta((q: any) => q.eq("status", "ativo").is("importado_em", null).eq("categoria", CATEGORIA_CIRCUITO)),
      conta((q: any) =>
        semCircuito(q.eq("status", "ativo").is("importado_em", null)).eq("liberado_manual", false).or(FILTRO_INCOMPLETO),
      ),
    ]);

    const { data: runs } = await supabaseAdmin
      .from("cativa_import_runs")
      .select("*")
      .order("iniciado_em", { ascending: false })
      .limit(10);

    return { ativos, esgotados, pendentes, comVoos, erros, circuitos, incompletos, runs: runs ?? [] };
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
    // Reconsulta direta: garante que ESTE pacote seja reprocessado agora,
    // em vez de apenas voltar para o fim/começo da fila geral.
    const { reprocessarPacotes } = await import("@/lib/cativa/voos.server");
    return await reprocessarPacotes([data.pacoteId]);
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
    // O arquivamento só acontece depois que o pacote é realmente salvo
    // (ver arquivarPacotesCativa chamado ao gravar o pacote no painel).


    return {
      pacotes: (pacotes ?? []).map((p: any) => ({ pacote: p, voos: porPacote.get(p.id) ?? [] })),
    };
  });

/** Arquiva (ou desarquiva) pacotes Cativa manualmente. */
export const arquivarPacotesCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; arquivar: boolean }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const ids = (data.ids ?? []).slice(0, 200);
    if (!ids.length) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cativa_pacotes")
      .update({ importado_em: data.arquivar ? new Date().toISOString() : null } as any)
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Reprocessa em lote os pacotes cuja consulta à Infotravel veio zerada
 * (sem opções, sem voos ou com erro) — ou todos os ativos quando `tudo`.
 */
export const reprocessarLoteCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tudo?: boolean; limite?: number; forcar?: boolean; incompletos?: boolean } | undefined) => input ?? {},
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limite = Math.min(data.limite ?? 5, 5);

    if (!data.forcar) {
      const { processarFilaVoos } = await import("@/lib/cativa/voos.server");
      const res = await processarFilaVoos(limite);
      const { count } = await supabaseAdmin
        .from("cativa_pacotes")
        .select("id", { count: "exact", head: true })
        .eq("status", "ativo")
        .is("importado_em", null)
        .eq("voos_status", "pendente")
        .or(`categoria.is.null,categoria.neq.${CATEGORIA_CIRCUITO}`)
        .lte("voos_proxima_em", new Date().toISOString());
      return { ...res, restantes: count ?? 0 };
    }

    let q = supabaseAdmin
      .from("cativa_pacotes")
      .select("id")
      .eq("status", "ativo")
      .is("importado_em", null)
      .not("link_orcamento", "is", null)
      .or(`categoria.is.null,categoria.neq.${CATEGORIA_CIRCUITO}`)
      .limit(limite);
    if (data.incompletos) q = q.eq("liberado_manual", false).or(FILTRO_INCOMPLETO);
    else if (!data.tudo) q = q.or("voos_status.eq.sem_opcoes,voos_status.eq.erro,voos_opcoes.is.null,voos_opcoes.eq.0");

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.id as string);
    if (!ids.length) return { processados: 0, ok: 0, erros: 0, restantes: 0 };

    const { reprocessarPacotes } = await import("@/lib/cativa/voos.server");
    const res = await reprocessarPacotes(ids);
    let restantesQ = supabaseAdmin
      .from("cativa_pacotes")
      .select("id", { count: "exact", head: true })
      .eq("status", "ativo")
      .is("importado_em", null)
      .not("link_orcamento", "is", null)
      .or(`categoria.is.null,categoria.neq.${CATEGORIA_CIRCUITO}`);
    if (data.incompletos) {
      restantesQ = restantesQ.eq("liberado_manual", false).or(FILTRO_INCOMPLETO);
    } else if (!data.tudo) {
      restantesQ = restantesQ.or(
        "voos_status.eq.sem_opcoes,voos_status.eq.erro,voos_status.eq.pendente,voos_opcoes.is.null,voos_opcoes.eq.0",
      );
    }
    const { count: restantes } = await restantesQ;
    return { ...res, restantes: restantes ?? 0 };
  });

/** Marca/desmarca "ir do mesmo jeito": pacote aparece no Command Center mesmo incompleto. */
export const liberarPacoteCativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pacoteId: string; liberar: boolean }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cativa_pacotes")
      .update({ liberado_manual: data.liberar } as any)
      .eq("id", data.pacoteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
