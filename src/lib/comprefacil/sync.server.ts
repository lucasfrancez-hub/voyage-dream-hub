/**
 * Importação do catálogo CompreFácil (GeniusWS): pacotes e serviços offline.
 *
 * A API devolve listas paginadas com o objeto completo, então guardamos os
 * campos comerciais em colunas e o restante em `raw` para uso posterior.
 */
import { chamarCompreFacil } from "./auth.server";

const POR_PAGINA = 50;

type Pagina<T> = { MetaData?: { TotalPaginas?: number; TotalItens?: number }; Items?: T[] };

async function paginar<T>(path: string): Promise<T[]> {
  const itens: T[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas && pagina <= 200) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await chamarCompreFacil(`${path}${sep}Pagina=${pagina}&ItensPorPagina=${POR_PAGINA}`);
    if (!r.ok) throw new Error(`CompreFácil ${path} respondeu ${r.status}`);
    const dados = r.dados as Pagina<T>;
    itens.push(...(dados.Items ?? []));
    totalPaginas = dados.MetaData?.TotalPaginas ?? 1;
    pagina += 1;
  }
  return itens;
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpo = v.trim();
  return limpo ? limpo : null;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type PacoteApi = Record<string, any>;
type ServicoApi = Record<string, any>;

function mapearPacote(p: PacoteApi) {
  return {
    externo_id: p.Id as number,
    nome: texto(p.Nome) ?? `Pacote ${p.Id}`,
    referencia: texto(p.ReferenciaInterna),
    observacao: texto(p.Observacao),
    cidade: texto(p.Cidade?.Nome),
    cidade_id: numero(p.CidadeId),
    cidade_saida: texto(p.CidadeSaida),
    destino_id: numero(p.PacoteDestinoId),
    moeda: texto(p.Moeda?.Sigla) ?? texto(p.Moeda?.Simbolo),
    valor_servico: numero(p.ValorServico),
    valor_taxa: numero(p.ValorTaxa),
    dias: numero(p.Dias),
    minimo_noites: numero(p.MinimoDeNoites),
    validade_de: texto(p.ValidadeDe),
    validade_ate: texto(p.ValidadeAte),
    data_limite: texto(p.DataLimite),
    ativo: p.Ativo !== false,
    destaque: p.Destaque === true,
    sob_pedido: p.SobPedido === true,
    circuito: p.Circuito === true,
    evento: p.Evento === true,
    casamento: p.Casamento === true,
    quantidade_disponivel: numero(p.QuantidadeDisponivel),
    imagens: (p.PacoteImagens ?? []).map((i: any) => ({
      url: `https://v2.comprefacil.tur.br${i.Imagem}`,
      banner: i.Banner === true,
    })),
    periodos: (p.PacotePeriodos ?? []).map((i: any) => ({ de: i.CheckinDe, ate: i.CheckoutAte })),
    inclui: (p.PacotesInclui ?? []).map((i: any) => ({
      titulo: i.Titulo,
      descritivo: i.Descritivo,
      nao_inclui: i.NaoInclui === true,
    })),
    hoteis: (p.PacoteHoteis ?? []).map((i: any) => ({ nome: i.NomeHotel, integrador: i.HotelIntegrador })),
    raw: p,
    visto_em: new Date().toISOString(),
  };
}

function mapearServico(s: ServicoApi, tipos: Map<number, string>) {
  const f = s.OfflineServicoFornecedor ?? {};
  return {
    externo_id: s.Id as number,
    titulo: texto(s.Titulo) ?? `Serviço ${s.Id}`,
    descricao: texto(s.Descricao),
    tipo_id: numero(s.OfflineServicoTipoId),
    tipo: tipos.get(s.OfflineServicoTipoId) ?? null,
    fornecedor_id: numero(s.OfflineServicoFornecedorId),
    fornecedor: texto(f.Nome) ?? texto(f.RazaoSocial),
    fornecedor_cidade_id: numero(f.CidadeId),
    internacional: f.Internacional === true,
    combo: s.Combo === true,
    destaque: s.Destaque === true,
    ativo: s.Ativo !== false,
    dias_semana: texto(s.DiasSemana),
    prazo_cancelamento: numero(s.PrazoCancelamento),
    politica_cancelamento: texto(s.PoliticaCancelamento),
    dias_antecedencia: numero(s.DiasAntecedenciaReserva),
    raw: s,
    visto_em: new Date().toISOString(),
  };
}

async function gravar(
  tabela: "comprefacil_pacotes" | "comprefacil_servicos",
  linhas: Array<Record<string, unknown>>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existentes } = await supabaseAdmin.from(tabela).select("externo_id").returns<{ externo_id: number }[]>();
  const jaTinha = new Set((existentes ?? []).map((e) => e.externo_id));

  let novos = 0;
  for (let i = 0; i < linhas.length; i += 100) {
    const lote = linhas.slice(i, i + 100);
    const { error } = await supabaseAdmin.from(tabela).upsert(lote as any, { onConflict: "externo_id" });
    if (error) throw new Error(`Falha ao gravar ${tabela}: ${error.message}`);
    novos += lote.filter((l) => !jaTinha.has(l["externo_id"] as number)).length;
  }

  // some do catálogo => inativa (nunca apaga, para manter histórico de pedidos)
  const vistos = linhas.map((l) => l["externo_id"] as number);
  let inativados = 0;
  if (vistos.length) {
    const { data } = await supabaseAdmin
      .from(tabela)
      .update({ ativo: false } as any)
      .eq("ativo", true)
      .not("externo_id", "in", `(${vistos.join(",")})`)
      .select("externo_id");
    inativados = data?.length ?? 0;
  }

  return { novos, atualizados: linhas.length - novos, inativados };
}

export type ResultadoImportacaoCF = {
  pacotes_novos: number;
  pacotes_atualizados: number;
  pacotes_inativados: number;
  servicos_novos: number;
  servicos_atualizados: number;
  servicos_inativados: number;
};

/** Importa pacotes e/ou serviços do CompreFácil para o catálogo interno. */
export async function importarCompreFacil(
  escopo: "pacotes" | "servicos" | "tudo" = "tudo",
): Promise<ResultadoImportacaoCF & { runId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: run } = await supabaseAdmin
    .from("comprefacil_import_runs")
    .insert({ escopo } as any)
    .select("id")
    .single();
  const runId = (run as any)?.id as string;

  const res: ResultadoImportacaoCF = {
    pacotes_novos: 0,
    pacotes_atualizados: 0,
    pacotes_inativados: 0,
    servicos_novos: 0,
    servicos_atualizados: 0,
    servicos_inativados: 0,
  };

  try {
    if (escopo === "pacotes" || escopo === "tudo") {
      const pacotes = await paginar<PacoteApi>("/api/pacote");
      const r = await gravar("comprefacil_pacotes", pacotes.map(mapearPacote));
      res.pacotes_novos = r.novos;
      res.pacotes_atualizados = r.atualizados;
      res.pacotes_inativados = r.inativados;
    }

    if (escopo === "servicos" || escopo === "tudo") {
      const tipos = new Map<number, string>();
      const listaTipos = await chamarCompreFacil("/api/offlineservicotipo/list/");
      for (const t of ((listaTipos.dados as any)?.Items ?? []) as any[]) {
        tipos.set(t.Id, t.Descricao);
      }
      const servicos = await paginar<ServicoApi>("/api/offlineservico");
      const r = await gravar("comprefacil_servicos", servicos.map((s) => mapearServico(s, tipos)));
      res.servicos_novos = r.novos;
      res.servicos_atualizados = r.atualizados;
      res.servicos_inativados = r.inativados;
    }

    await supabaseAdmin
      .from("comprefacil_import_runs")
      .update({ ...res, status: "concluido", finalizado_em: new Date().toISOString() } as any)
      .eq("id", runId);

    return { ...res, runId };
  } catch (e) {
    await supabaseAdmin
      .from("comprefacil_import_runs")
      .update({
        status: "erro",
        erro: e instanceof Error ? e.message : String(e),
        finalizado_em: new Date().toISOString(),
      } as any)
      .eq("id", runId);
    throw e;
  }
}
