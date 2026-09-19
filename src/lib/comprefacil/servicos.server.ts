/**
 * Serviços adicionais do motor de pacotes (transfers, passeios, proteção...).
 *
 * Fonte real: busca ao vivo da operadora (`POST /api/Servico/busca` na base de
 * serviços), exatamente como o portal faz — sempre atrelada à cidade de destino
 * e ao período pesquisado, já com o valor tarifado para a ocupação.
 */
import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "./auth.server";
import { contexto as cambioContexto, valorBRL } from "./cambio";

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
  /** datas/horários que a operadora oferece para este serviço */
  opcoes?: OpcaoServico[];
  /** data escolhida pelo cliente (YYYY-MM-DD) */
  dataSelecionada?: string | null;
  /** horário escolhido pelo cliente (HH:MM) */
  horaSelecionada?: string | null;
  /** true quando o cliente só trocou data/horário de um serviço já incluído */
  substituir?: boolean;
  /** tipo cru da operadora (0 serviço, 1 passeio, 2 ingresso, 3 transfer) */
  tipoServicoId?: number | null;
  /**
   * Identificador de markup da operadora (ex.: MarkupId 646) — metadado
   * interno do fornecedor, preservado apenas no servidor para a reserva
   * futura. NÃO representa percentual conhecido e NUNCA é exposto ao Sky Hub.
   */
  markupId?: number | null;
  /** Guid da busca ao vivo — necessário para reservar depois */
  buscaGuid?: string | null;
  /** payload ExtraIntegracao já decodificado (IDs específicos por tipo) */
  extra?: Record<string, string | number | boolean | null> | null;
};


export type OpcaoServico = {
  /** código da tarifa daquela data/horário (usado na reserva) */
  codigo: string | null;
  /** YYYY-MM-DD */
  data: string;
  /** HH:MM quando a operadora envia horário; null = dia inteiro */
  hora: string | null;
  /** valor total em BRL daquela opção */
  valor: number | null;
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
  // Regra: valor em moeda estrangeira é convertido pelo câmbio (`Taxa`) que a
  // operadora manda no próprio payload; valor já em BRL passa direto.
  const ctx = cambioContexto(s);
  const valor = valorBRL(s, {
    listagem: [s?.ValorListagem, s?.ValorTotalListagem],
    bruto: [s?.ValorVenda],
  }, ctx);
  const informacoes = [
    s?.Combo ? "Combo de serviços" : null,
    extra?.CategoriaServico ? `Categoria ${String(extra.CategoriaServico).toLowerCase()}` : null,
    extra?.NomeFornecedor ? `Operado por ${String(extra.NomeFornecedor).trim()}` : null,
  ].filter(Boolean) as string[];

  // Datas/horários que a operadora libera: `Tarifas` traz uma linha por data
  // (e horário, quando o passeio tem sessão); `DatasDisponiveis` é o plano B.
  const opcoes: OpcaoServico[] = [];
  const vistas = new Set<string>();
  const adicionar = (bruto: unknown, codigo: string | null, valorOpcao: number | null) => {
    const txt = String(bruto ?? "").trim();
    const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(txt);
    if (!m) return;
    const data = m[1]!;
    const hora = m[2] && m[3] && `${m[2]}:${m[3]}` !== "00:00" ? `${m[2]}:${m[3]}` : null;
    const chave = `${data}|${hora ?? ""}`;
    if (vistas.has(chave)) return;
    vistas.add(chave);
    opcoes.push({ codigo, data, hora, valor: valorOpcao });
  };
  for (const t of (Array.isArray(s?.Tarifas) ? s.Tarifas : []) as any[]) {
    const valorT = valorBRL(t, {
      listagem: [t?.ValorListagem, t?.ValorTotalListagem],
      bruto: [t?.ValorVenda],
    }, { ...cambioContexto(t), taxa: t?.Taxa ?? ctx.taxa });
    adicionar(t?.Data ?? t?.DataServico, t?.Codigo ? String(t.Codigo) : null, valorT > 0 ? valorT : null);
  }
  for (const d of (Array.isArray(s?.DatasDisponiveis) ? s.DatasDisponiveis : []) as any[]) {
    adicionar(d, null, valor > 0 ? valor : null);
  }
  opcoes.sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? ""));

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
    valor: valor > 0 ? valor : null,
    moeda: "BRL" as const,
    imagem: imagens[0] ?? null,
    imagens,
    opcoes,
    dataSelecionada: null,
    horaSelecionada: null,
    tipoServicoId: Number.isFinite(Number(s?.TipoServico)) ? Number(s?.TipoServico) : null,
    markupId: Number.isFinite(Number(s?.MarkupId)) ? Number(s.MarkupId) : null,
    extra:
      extra && typeof extra === "object"
        ? (extra as Record<string, string | number | boolean | null>)
        : null,
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

/** Instrumentação de uma busca de serviços (não sai para o Sky Hub cru). */
export type MetricasFornecedor = {
  /** chamadas HTTP reais feitas à operadora nesta execução */
  chamadas: number;
  /** soma do tempo gasto dentro das chamadas (download + fornecedor) */
  ms_rede: number;
  /** tempo dormindo entre consultas (polling) */
  ms_espera: number;
  /** tempo gastando CPU normalizando/parsing */
  ms_parsing: number;
  /** bytes de JSON recebidos da operadora */
  bytes: number;
  /** como a consulta terminou */
  desfecho: "concluido_com_resultados" | "concluido_sem_resultados" | "teto_de_tempo" | "erro";
};

function novasMetricas(): MetricasFornecedor {
  return {
    chamadas: 0,
    ms_rede: 0,
    ms_espera: 0,
    ms_parsing: 0,
    bytes: 0,
    desfecho: "teto_de_tempo",
  };
}

function tamanho(dados: unknown): number {
  try {
    return JSON.stringify(dados ?? null).length;
  } catch {
    return 0;
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
  /** objeto opcional preenchido com a instrumentação desta execução */
  metricas?: MetricasFornecedor;
}): Promise<ServicoDisponivel[]> {
  const met = p.metricas ?? novasMetricas();
  const ses = await sessaoCompreFacil();
  const base = COMPREFACIL_BASES.servico;
  // 300 por página: o catálogo de um destino cabe inteiro na primeira página,
  // então a resposta que encerra a busca já vem completa (a operadora devolve
  // vazio acima de 300).
  const porPagina = Math.min(300, Math.max(10, p.limite ?? 300));
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

  /** Uma chamada real à operadora, já instrumentada (tempo, bytes, contagem). */
  const chamar = async (caminho: string, tetoMs: number): Promise<any | null> => {
    const t0 = Date.now();
    met.chamadas++;
    const r = await limitarEspera(
      chamarCompreFacil(caminho, { base, method: "POST", body: corpo(guidAtual) }),
      tetoMs,
    ).catch(() => null);
    met.ms_rede += Date.now() - t0;
    if (!r) return null;
    met.bytes += tamanho(r.dados);
    return r.dados ?? null;
  };

  let guidAtual: string | null = null;
  const primeira = await chamar(rota(1), 60_000);
  const guid = (primeira as any)?.MetaData?.Guid as string | undefined;
  if (!guid) {
    met.desfecho = "erro";
    return [];
  }
  guidAtual = guid;

  // Escada de espera dirigida pelo ESTADO DO FORNECEDOR, não pelo relógio.
  // `BuscasAtivas = 0` significa que a operadora terminou: se veio lote, é
  // "concluído com resultados"; se veio vazio, é "concluído sem resultados" e
  // encerramos na hora (destino sem serviços NÃO é timeout). Uma consulta por
  // vez: nada de baixar o mesmo catálogo em paralelo.
  let dados: any = primeira;
  let itensVistos = ((primeira?.Items ?? []) as any[]).length;
  let concluido = buscasAtivas((primeira as any)?.MetaData) === 0;
  const limite = Date.now() + 60_000; // teto de segurança
  let intervalo = 700;

  while (!concluido && Date.now() < limite) {
    const t0 = Date.now();
    await espera(intervalo);
    met.ms_espera += Date.now() - t0;
    if (Date.now() >= limite) break;

    const r = await chamar(rota(1), 20_000);
    if (!r) {
      // chamada travada/timeout: a operadora ainda pode estar processando
      intervalo = Math.min(3000, Math.round(intervalo * 1.4));
      continue;
    }
    const lote = ((r?.Items ?? []) as any[]);
    if (lote.length >= itensVistos) {
      dados = r;
      itensVistos = lote.length;
    }
    if (buscasAtivas((r as any)?.MetaData) === 0) {
      concluido = true;
      break;
    }
    intervalo = Math.min(3000, Math.round(intervalo * 1.4));
  }

  const itens: any[] = [...((dados?.Items ?? []) as any[])];
  met.desfecho = concluido
    ? itens.length
      ? "concluido_com_resultados"
      : "concluido_sem_resultados"
    : "teto_de_tempo";

  // Concluído sem nada: não há o que paginar, encerra imediatamente.
  const totalItens = Number(dados?.MetaData?.TotalItens ?? 0);
  if (itens.length && totalItens > itens.length) {
    // Só vale pedir "tudo em uma página" se for um pedido DIFERENTE do que o
    // polling já baixou — senão seria rebaixar o mesmo payload de graça.
    const porPaginaCompleta = Math.min(300, totalItens);
    const lote =
      porPaginaCompleta > porPagina
        ? (((await chamar(
            `/api/Servico/busca?Pagina=1&ItensPorPagina=${porPaginaCompleta}`,
            15_000,
          )) as any)?.Items ?? [])
        : [];
    if ((lote as any[]).length > itens.length) {
      itens.splice(0, itens.length, ...(lote as any[]));
    } else {
      // Plano B: páginas restantes em paralelo (cada página é conteúdo novo).
      const paginas = Array.from(
        { length: Math.min(3, Math.max(0, Math.ceil(totalItens / porPagina) - 1)) },
        (_, k) => k + 2,
      );
      const respostas = await Promise.all(paginas.map((pagina) => chamar(rota(pagina), 12_000)));
      for (const r of respostas) itens.push(...(((r as any)?.Items ?? []) as any[]));
    }
  }


  const tParse = Date.now();
  const vistos = new Set<string>();
  const lista = itens
    .map(mapear)
    .map((s) => ({ ...s, buscaGuid: guid }))

    .filter((s) => {
      const chave = `${s.titulo}|${s.valor}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

  const ordenada = lista.sort(
    (a, b) =>
      Number(b.valor != null) - Number(a.valor != null) || (a.valor ?? 0) - (b.valor ?? 0),
  );
  met.ms_parsing += Date.now() - tParse;
  return ordenada;
}
