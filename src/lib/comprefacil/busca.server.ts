/**
 * Motor de busca de pacotes CompreFácil.
 *
 * A busca roda sobre o catálogo já importado (rápido e sempre disponível) e,
 * em paralelo, tenta puxar o mesmo termo direto na API do CompreFácil para
 * trazer/atualizar pacotes que ainda não estavam no nosso banco. Se a API
 * estiver fora do ar ou pedindo 2FA, a busca continua funcionando pelo cache.
 */
import { chamarCompreFacil } from "./auth.server";
import { mapearPacote, gravarPacotesCF } from "./sync.server";

export type FiltrosBuscaCF = {
  termo?: string;
  cidade?: string;
  /** Id oficial da cidade de destino na CompreFácil (vem do autopreencher) */
  cidadeId?: number | null;
  saida?: string;
  /** período desejado (ISO yyyy-mm-dd) */
  dataDe?: string | null;
  dataAte?: string | null;
  noitesMin?: number | null;
  noitesMax?: number | null;
  precoMax?: number | null;
  somenteDestaque?: boolean;
  somenteCircuito?: boolean;
  incluirSobPedido?: boolean;
  ordenar?: "relevancia" | "preco" | "nome" | "dias";
  pagina?: number;
  porPagina?: number;
  /** consulta a API do CompreFácil antes de responder */
  aoVivo?: boolean;
};

export type PacoteBuscaCF = {
  id: string;
  externo_id: number;
  nome: string;
  cidade: string | null;
  cidade_saida: string | null;
  moeda: string | null;
  valor_servico: number | null;
  valor_taxa: number | null;
  valor_total: number | null;
  dias: number | null;
  validade_de: string | null;
  validade_ate: string | null;
  destaque: boolean;
  circuito: boolean;
  sob_pedido: boolean;
  imagem: string | null;
  periodos: Array<{ de: string | null; ate: string | null }>;
  hoteis: string[];
};

const PADRAO_POR_PAGINA = 24;

function normaliza(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Consulta o buscador oficial de pacotes da CompreFácil
 * (mesmo motor de v2.comprefacil.tur.br → /api/Pacote/list, com termo e período)
 * e grava o que vier. Devolve os Ids externos encontrados.
 */
export async function refrescarBuscaAoVivo(
  termo: string,
  dataDe?: string | null,
  dataAte?: string | null,
): Promise<{ ok: boolean; ids: number[] }> {
  const busca = normaliza(termo ?? "");
  const corpo = {
    Busca: busca,
    Datain: dataDe ?? "",
    Dataout: dataAte ?? "",
  };
  const ids: number[] = [];
  try {
    for (let pagina = 1; pagina <= 6; pagina++) {
      const r = await chamarCompreFacil(`/api/Pacote/list?Pagina=${pagina}&ItensPorPagina=50`, {
        method: "POST",
        body: corpo,
      });
      if (!r.ok) return { ok: false, ids };
      const dados = r.dados as any;
      const itens: any[] = dados?.Items ?? [];
      if (itens.length) {
        const linhas = itens.map((p: any) => mapearPacote(p));
        await gravarPacotesCF(linhas);
        for (const l of linhas) if (l.externo_id) ids.push(Number(l.externo_id));
      }
      const totalPaginas = Number(dados?.MetaData?.TotalPaginas ?? 0);
      if (!totalPaginas || pagina >= totalPaginas) break;
    }
    return { ok: true, ids };
  } catch (e) {
    console.error("[comprefacil] busca ao vivo falhou:", e instanceof Error ? e.message : e);
    return { ok: false, ids };
  }
}

/** Atualiza um pacote específico direto na operadora. */
export async function atualizarPacoteAoVivo(externoId: number): Promise<boolean> {
  try {
    const r = await chamarCompreFacil(`/api/pacote/${externoId}`);
    const bruto: any = (r.dados as any)?.Item ?? r.dados;
    if (!r.ok || !bruto?.Id) return false;
    await gravarPacotesCF([mapearPacote(bruto)]);
    return true;
  } catch (e) {
    console.error("[comprefacil] atualização ao vivo falhou:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function buscarPacotesCF(filtros: FiltrosBuscaCF): Promise<{
  itens: PacoteBuscaCF[];
  total: number;
  pagina: number;
  porPagina: number;
  aoVivo: { tentou: boolean; encontrados: number };
}> {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const porPagina = Math.min(60, Math.max(6, filtros.porPagina ?? PADRAO_POR_PAGINA));

  // Consulta sempre o buscador oficial da operadora (termo + período pedido)
  const termoVivo = (filtros.termo?.trim() || filtros.cidade?.trim() || "").trim();
  const vivo = await refrescarBuscaAoVivo(termoVivo, filtros.dataDe ?? "", filtros.dataAte ?? "");
  const encontradosAoVivo = vivo.ids.length;
  const tentouAoVivo = true;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("comprefacil_pacotes")
    .select(
      "id, externo_id, nome, cidade, cidade_saida, moeda, valor_servico, valor_taxa, dias, validade_de, validade_ate, destaque, circuito, sob_pedido, imagens, periodos, hoteis",
      { count: "exact" },
    )
    .eq("ativo", true);

  // Quando a operadora respondeu, o resultado é exatamente o que ela ofereceu no período
  if (vivo.ok) q = q.in("externo_id", vivo.ids.length ? vivo.ids : [-1]);

  const termo = filtros.termo?.trim();
  if (termo) {
    const b = `%${termo}%`;
    q = q.or(`nome.ilike.${b},cidade.ilike.${b},cidade_saida.ilike.${b},referencia.ilike.${b}`);
  }
  if (filtros.cidadeId) q = q.eq("cidade_id", filtros.cidadeId);
  else if (filtros.cidade?.trim()) q = q.ilike("cidade", `%${filtros.cidade.trim()}%`);
  if (filtros.saida?.trim()) q = q.ilike("cidade_saida", `%${filtros.saida.trim()}%`);
  if (filtros.noitesMin) q = q.gte("dias", filtros.noitesMin);
  if (filtros.noitesMax) q = q.lte("dias", filtros.noitesMax);
  if (filtros.precoMax) q = q.lte("valor_servico", filtros.precoMax);
  if (filtros.somenteDestaque) q = q.eq("destaque", true);
  if (filtros.somenteCircuito) q = q.eq("circuito", true);
  if (filtros.incluirSobPedido === false) q = q.eq("sob_pedido", false);
  // pacote precisa estar válido dentro do período pedido
  if (filtros.dataDe) q = q.or(`validade_ate.is.null,validade_ate.gte.${filtros.dataDe}`);
  if (filtros.dataAte) q = q.or(`validade_de.is.null,validade_de.lte.${filtros.dataAte}`);

  switch (filtros.ordenar) {
    case "preco":
      q = q.order("valor_servico", { ascending: true, nullsFirst: false });
      break;
    case "dias":
      q = q.order("dias", { ascending: true, nullsFirst: false });
      break;
    case "nome":
      q = q.order("nome", { ascending: true });
      break;
    default:
      q = q.order("destaque", { ascending: false }).order("nome", { ascending: true });
  }

  const { data, count, error } = await q.range((pagina - 1) * porPagina, pagina * porPagina - 1);
  if (error) throw new Error(error.message);

  const itens: PacoteBuscaCF[] = ((data as any[]) ?? []).map((p) => {
    const imagens = Array.isArray(p.imagens) ? p.imagens : [];
    const banner = imagens.find((i: any) => i?.banner) ?? imagens[0];
    const servico = Number(p.valor_servico ?? 0);
    const taxa = Number(p.valor_taxa ?? 0);
    return {
      id: p.id,
      externo_id: p.externo_id,
      nome: p.nome,
      cidade: p.cidade ?? null,
      cidade_saida: p.cidade_saida ?? null,
      moeda: p.moeda ?? "BRL",
      valor_servico: p.valor_servico ?? null,
      valor_taxa: p.valor_taxa ?? null,
      valor_total: servico || taxa ? Number((servico + taxa).toFixed(2)) : null,
      dias: p.dias ?? null,
      validade_de: p.validade_de ?? null,
      validade_ate: p.validade_ate ?? null,
      destaque: p.destaque === true,
      circuito: p.circuito === true,
      sob_pedido: p.sob_pedido === true,
      imagem: banner?.url ?? null,
      periodos: Array.isArray(p.periodos) ? p.periodos.slice(0, 6) : [],
      hoteis: Array.isArray(p.hoteis)
        ? p.hoteis.map((h: any) => String(h?.nome ?? "")).filter(Boolean).slice(0, 4)
        : [],
    };
  });

  return { itens, total: count ?? 0, pagina, porPagina, aoVivo: { tentou: tentouAoVivo, encontrados: encontradosAoVivo } };
}
