/**
 * Serviços adicionais do motor de pacotes (transfers, passeios, proteção...).
 *
 * Fonte real: busca ao vivo da operadora (`POST /api/Servico/busca` na base de
 * serviços), exatamente como o portal faz — sempre atrelada à cidade de destino
 * e ao período pesquisado, já com o valor tarifado para a ocupação.
 */
import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "./auth.server";

export type ServicoDisponivel = {
  id: string;
  externoId: number;
  titulo: string;
  categoria: string;
  descricao: string | null;
  fornecedor: string | null;
  politica: string | null;
  informacoes: string[];
  recomendado: boolean;
  /** valor total já tarifado para a ocupação pesquisada; null = sob consulta */
  valor: number | null;
  moeda: "BRL";
  imagem?: string | null;
  /** galeria completa do serviço (quando a operadora envia) */
  imagens?: string[];
  /** logomarca do fornecedor (seguradora, operadora do passeio) */
  logo?: string | null;
  /** coberturas detalhadas (seguro viagem) */
  coberturas?: { nome: string; valor: string | null }[];
};


const semHtml = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/<li[^>]*>/gi, " • ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buscasAtivas(meta: any): number {
  try {
    const v = meta?.BuscasAtivas;
    if (Array.isArray(v)) return v.length;
    if (typeof v === "string") return (JSON.parse(v) as unknown[]).length;
  } catch {
    /* ignora */
  }
  return 0;
}

const TIPOS: Record<number, string> = {
  0: "Serviços",
  1: "Passeios",
  2: "Ingressos",
  3: "Transfers",
};

function mapear(s: any, i: number): ServicoDisponivel {
  let extra: any = {};
  try {
    extra = s?.ExtraIntegracao ? JSON.parse(String(s.ExtraIntegracao)) : {};
  } catch {
    extra = {};
  }
  const imagens: string[] = (Array.isArray(s?.Imagens) ? s.Imagens : [])
    .map((im: any) => (typeof im === "string" ? im : (im?.Url ?? im?.Imagem ?? im?.Caminho ?? "")))
    .map((u: any) => String(u ?? "").trim())
    .filter((u: string) => /^https?:\/\//i.test(u));
  const valor = Number(s?.ValorVenda ?? 0);
  const informacoes = [
    s?.Combo ? "Combo de serviços" : null,
    extra?.CategoriaServico ? `Categoria ${String(extra.CategoriaServico).toLowerCase()}` : null,
    extra?.NomeFornecedor ? `Operado por ${String(extra.NomeFornecedor).trim()}` : null,
  ].filter(Boolean) as string[];

  return {
    id: `cfs-${s?.CodigoFornecedor ?? i}-${i}`,
    externoId: Number(s?.CodigoFornecedor ?? 0) || 0,
    titulo: semHtml(s?.Titulo) ?? "Serviço",
    categoria:
      semHtml(s?.TipoServicoDesc)?.replace(/^\w/, (c) => c.toUpperCase()) ??
      TIPOS[Number(s?.TipoServico ?? 0)] ??
      "Serviços",
    descricao: semHtml(s?.Descricao),
    fornecedor: extra?.NomeFornecedor ? String(extra.NomeFornecedor).trim() : (s?.Fornecedor ?? null),
    politica: semHtml(s?.PoliticaCancelamento),
    informacoes,
    recomendado: false,
    valor: valor > 0 ? Number(valor.toFixed(2)) : null,
    moeda: "BRL" as const,
    imagem: imagens[0] ?? null,
    imagens,
  };
}

/** Espera com teto de tempo: devolve null se a operadora demorar demais. */
async function limitarEspera<T>(promessa: Promise<T>, ms: number): Promise<T | null> {
  let id: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<null>((r) => {
    id = setTimeout(() => r(null), ms);
  });
  try {
    return await Promise.race([promessa, teto]);
  } finally {
    if (id) clearTimeout(id);
  }
}

export async function buscarServicosDestinoCF(p: {
  cidadeId: number;
  data: string;
  /** fim do período (volta / checkout); default = mesma data */
  dataFim?: string | null;
  adultos: number;
  idades?: number[];
  limite?: number;
  destino?: string | null;
}): Promise<ServicoDisponivel[]> {
  const ses = await sessaoCompreFacil();
  const base = COMPREFACIL_BASES.servico;
  // 100 por página: menos requisições para varrer o mesmo catálogo.
  const porPagina = Math.min(100, Math.max(10, p.limite ?? 100));
  const rota = (pagina: number) =>
    `/api/Servico/busca?Pagina=${pagina}&ItensPorPagina=${porPagina}`;

  const corpo = (guid: string | null) => ({
    AgenciaId: Number(ses.agenciaId ?? 0),
    Guid: guid,
    PacoteId: 0,
    Adt: Math.max(1, p.adultos || 1),
    IdadesChd: p.idades ?? [],
    De: p.data,
    Ate: p.dataFim || p.data,
    Cidade: { Id: p.cidadeId },
    TipoServico: 0,
    ServicoExclusivo: false,
    BuscaEsim: false,
    EscreveLog: false,
    FiltroServico: {
      Ativo: null,
      Categoria: -1,
      TipoServico: "",
      Ordenacao: "",
      Tipo: "",
      Fornecedores: [],
    },
  });

  const __t0 = Date.now();
  const __log = (m: string) => console.log(`[cf-serv] ${m} ${(Date.now() - __t0) / 1000}s`);
  const inicio = await chamarCompreFacil(rota(1), { base, method: "POST", body: corpo(null) });
  __log("start");
  const guid = (inicio.dados as any)?.MetaData?.Guid as string | undefined;
  if (!guid) return [];

  let dados: any = inicio.dados;
  let vazioSeguido = 0;
  let anterior = -1;
  let estavel = 0;
  // polling adaptativo: começa rápido e só desacelera se a operadora demorar
  const intervalos = [700, 900, 1200, 1500, 1800, 2200, 2500, 3000, 3000, 3000, 3000, 3000];
  const limite = Date.now() + 40_000; // teto de segurança: devolve o melhor lote já recebido
  for (let i = 0; i < intervalos.length; i++) {
    await espera(intervalos[i]!);
    const r = await chamarCompreFacil(rota(1), { base, method: "POST", body: corpo(guid) }).catch(
      () => null,
    );
    if (!r) continue;
    // guarda sempre a melhor resposta já vista (a operadora às vezes devolve vazio depois de preencher)
    if (((r.dados as any)?.Items ?? []).length >= ((dados?.Items ?? []) as any[]).length) dados = r.dados;
    const meta = (r.dados as any)?.MetaData;
    const itens = Number(((r.dados as any)?.Items ?? []).length);
    const ativas = buscasAtivas(meta);
    // fornecedores terminaram e já há resultado: encerra imediatamente
    if (itens > 0 && ativas === 0) break;
    // sem fornecedores ativos e ainda sem itens: poucos ciclos de carência
    if (ativas === 0 && itens === 0) {
      vazioSeguido++;
      if (vazioSeguido >= 3) break;
    } else {
      vazioSeguido = 0;
    }
    // contagem estabilizada por 2 ciclos com muitos itens: não vale esperar mais
    if (itens > 0) {
      estavel = itens === anterior ? estavel + 1 : 0;
      if (estavel >= 2 && itens >= 20) break;
    }
    anterior = itens;
    // já há um catálogo utilizável: não vale segurar a tela esperando o resto
    if (itens >= 20 && Date.now() - __t0 > 15_000) break;
    if (Date.now() > limite) break;
  }



  __log("polling");
  const itens: any[] = [...((dados?.Items ?? []) as any[])];
  // Todas as páginas restantes em uma única rodada paralela, com teto de tempo.
  // Antes eram lotes de 4 aguardados em sequência: cada rodada custava ~20 s e
  // a busca de serviços passava de um minuto.
  const totalPaginas = Math.min(5, Number(dados?.MetaData?.TotalPaginas ?? 1) || 1);
  const paginas = Array.from({ length: Math.max(0, totalPaginas - 1) }, (_, k) => k + 2);
  if (paginas.length) {
    const respostas = await Promise.all(
      paginas.map((pagina) =>
        limitarEspera(
          chamarCompreFacil(rota(pagina), { base, method: "POST", body: corpo(guid) }),
          15_000,
        ).catch(() => null),
      ),
    );
    for (const r of respostas) itens.push(...(((r?.dados as any)?.Items ?? []) as any[]));
  }

  __log("paginas");
  const vistos = new Set<string>();
  const lista = itens
    .map(mapear)
    .filter((s) => {
      const chave = `${s.titulo}|${s.valor}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

  return lista.sort(
    (a, b) =>
      Number(b.valor != null) - Number(a.valor != null) || (a.valor ?? 0) - (b.valor ?? 0),
  );
}
