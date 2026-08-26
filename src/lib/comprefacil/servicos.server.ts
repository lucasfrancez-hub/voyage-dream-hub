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

  const inicio = await chamarCompreFacil(rota(1), { base, method: "POST", body: corpo(null) });
  const guid = (inicio.dados as any)?.MetaData?.Guid as string | undefined;
  if (!guid) return [];

  // Consultas sobrepostas: a operadora atende o polling em milissegundos
  // enquanto os fornecedores rodam, mas a chamada que traz o catálogo fica
  // aberta (long-poll) por 15 a 40 s — e às vezes estoura o tempo da conexão.
  // Em vez de esperar uma chamada por vez, disparamos consultas em cadência e
  // aproveitamos a primeira que voltar completa. Assim uma chamada travada
  // nunca deixa a tela sem serviços.
  let dados: any = inicio.dados;
  let pronto = false;
  let emVoo = 0;
  const limite = Date.now() + 60_000; // teto de segurança
  const consultar = () => {
    emVoo++;
    void chamarCompreFacil(rota(1), { base, method: "POST", body: corpo(guid) })
      .then((r) => {
        const lote = ((r?.dados as any)?.Items ?? []) as any[];
        // guarda sempre a melhor resposta já vista (a operadora às vezes devolve vazio depois de preencher)
        if (lote.length >= ((dados?.Items ?? []) as any[]).length) dados = r.dados;
        if (lote.length && buscasAtivas((r.dados as any)?.MetaData) === 0) pronto = true;
      })
      .catch(() => null)
      .finally(() => {
        emVoo--;
      });
  };

  const intervalos = [700, 900, 1200, 1500, 1800, 2200, 3000, 4000, 5000, 5000, 5000, 5000, 5000];
  for (const intervalo of intervalos) {
    if (pronto || Date.now() > limite) break;
    await espera(intervalo);
    if (pronto || Date.now() > limite) break;
    if (emVoo < 4) consultar();
  }
  // Ainda há consultas abertas? Espera um pouco mais pela que trouxer o catálogo.
  while (!pronto && emVoo > 0 && Date.now() < limite) await espera(250);

  // Catálogo inteiro em uma única requisição: depois que os fornecedores
  // terminam, pedir 500 por página responde em segundos, enquanto buscar
  // página por página custava 12 s cada.
  const itens: any[] = [...((dados?.Items ?? []) as any[])];
  const totalItens = Number(dados?.MetaData?.TotalItens ?? 0);
  if (totalItens > itens.length) {
    // A operadora ignora pedidos acima de 300 por página (devolve vazio).
    const completa = await limitarEspera(
      chamarCompreFacil(
        `/api/Servico/busca?Pagina=1&ItensPorPagina=${Math.min(300, totalItens)}`,
        { base, method: "POST", body: corpo(guid) },
      ),
      15_000,
    ).catch(() => null);
    const lote = ((completa?.dados as any)?.Items ?? []) as any[];
    if (lote.length > itens.length) {
      itens.splice(0, itens.length, ...lote);
    } else {
      // Plano B: páginas restantes em paralelo.
      const paginas = Array.from(
        { length: Math.min(3, Math.max(0, Math.ceil(totalItens / porPagina) - 1)) },
        (_, k) => k + 2,
      );
      const respostas = await Promise.all(
        paginas.map((pagina) =>
          limitarEspera(
            chamarCompreFacil(rota(pagina), { base, method: "POST", body: corpo(guid) }),
            12_000,
          ).catch(() => null),
        ),
      );
      for (const r of respostas) itens.push(...(((r?.dados as any)?.Items ?? []) as any[]));
    }
  }


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
