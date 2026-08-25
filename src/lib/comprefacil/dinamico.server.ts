/**
 * Motor dinâmico da CompreFácil (Busca Fácil).
 *
 * Não usa pacote pronto: consulta a malha aérea e a listagem de hotéis da
 * própria operadora, com o protocolo assíncrono dela (Guid + polling até
 * `BuscasAtivas` esvaziar).
 */
import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "./auth.server";
import { guardarBuscaCF } from "./busca-cache.server";
import type { PassHubOferta, PassHubVoo } from "@/lib/passhub/types";
import type { HotelPacote, OcupacaoQuarto, QuartoPacote } from "@/lib/pacote-motor/mapear";

const FILTRO_AEREO = {
  HorarioIdaMinimo: 0,
  HorarioIdaMaximo: 23,
  HorarioVoltaMinimo: 0,
  HorarioVoltaMaximo: 23,
  Cias: [],
  Aeroportos: [],
  Bagagem: -1,
  TodasFamilias: true,
  Fornecedores: [],
  Familia: [],
  MinimoDuracaoTrechos: [],
  MaximoDuracaoTrechos: [],
  NumeroParadasIda: -1,
  NumeroParadasVolta: -1,
  Ordenacao: "asc",
};

const FILTRO_HOTEL = {
  EstrelasMinimo: 0,
  EstrelasMaximo: 5,
  Fornecedores: [],
  Reembolsavel: -1,
  Pensao: [],
  Pensoes: [],
  Ordenacao: "",
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function limitarEspera<T>(promessa: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  const resultado = await Promise.race([promessa, limite]);
  if (timer) clearTimeout(timer);
  return resultado;
}

/** Teto de segurança: nunca puxar mais que isso, mesmo que a operadora ofereça. */
const MAX_ITENS = 600;
const MAX_PAGINAS = 20;

/** Quantas páginas ainda faltam depois da primeira, segundo o MetaData da operadora. */
function paginasRestantes(meta: any, porPagina: number, jaLidos: number): number {
  const total = Math.min(MAX_ITENS, Number(meta?.TotalItens ?? 0) || 0);
  if (total <= jaLidos) return 0;
  return Math.min(MAX_PAGINAS - 1, Math.ceil((total - jaLidos) / porPagina));
}

function buscasAtivas(meta: any): number {
  const bruto = meta?.BuscasAtivas;
  if (!bruto || bruto === "null") return 0;
  try {
    const lista = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
    return Array.isArray(lista) ? lista.length : 0;
  } catch {
    return 0;
  }
}

/* --------------------------------- aéreo --------------------------------- */

export type BuscaAereoCF = {
  origem: string;
  destino: string;
  ida: string;
  volta?: string | null;
  adultos: number;
  criancas?: number;
  bebes?: number;
  idades?: number[];
  porPagina?: number;
};

export async function buscarAereoDinamicoCF(p: BuscaAereoCF): Promise<PassHubOferta[]> {
  const ses = await sessaoCompreFacil();
  const agenciaId = Number(ses.agenciaId ?? 0);
  const segmentos = [
    { AeroportoPartida: p.origem, AeroportoChegada: p.destino, PaisChegada: null, DataPartida: p.ida },
    ...(p.volta
      ? [{ AeroportoPartida: p.destino, AeroportoChegada: p.origem, PaisChegada: null, DataPartida: p.volta }]
      : []),
  ];

  const corpo = (guid: string | null) => ({
    Adt: Math.max(1, p.adultos || 1),
    Chd: p.criancas ?? 0,
    Inf: p.bebes ?? 0,
    ...(p.idades?.length ? { Idades: p.idades } : {}),
    AgenciaId: agenciaId,
    TipoBusca: p.volta ? "ida-volta" : "ida",
    ...(guid ? { Guid: guid } : {}),
    SegmentosBusca: segmentos,
    FiltroAereo: FILTRO_AEREO,
  });

  const porPagina = p.porPagina ?? 100;
  const rota = `/api/Aereo/busca?Pagina=1&ItensPorPagina=${porPagina}`;
  const base = COMPREFACIL_BASES.aereo;

  const inicio = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(null) });
  const guid = (inicio.dados as any)?.Aereos?.MetaData?.Guid as string | undefined;
  if (!guid) return [];

  // Consultas sobrepostas (mesmo padrão dos serviços): enquanto as companhias
  // respondem, o polling volta na hora; a chamada que fecha a busca fica aberta
  // e pode travar. Disparamos em cadência e usamos a primeira que vier completa.
  let dados: any = inicio.dados;
  let pronto = false;
  let emVoo = 0;
  const limitePolling = Date.now() + 45_000;
  const consultar = () => {
    emVoo++;
    void chamarCompreFacil(rota, { base, method: "POST", body: corpo(guid) })
      .then((r) => {
        const meta = (r?.dados as any)?.Aereos?.MetaData;
        const total = Number(meta?.TotalItens ?? 0);
        if (total >= Number(dados?.Aereos?.MetaData?.TotalItens ?? 0)) dados = r.dados;
        if (total > 0 && (buscasAtivas(meta) === 0 || total >= 40)) pronto = true;
      })
      .catch(() => null)
      .finally(() => {
        emVoo--;
      });
  };

  const intervalos = [700, 900, 1200, 1500, 1800, 2200, 3000, 4000, 5000, 5000, 5000, 5000];
  for (const intervalo of intervalos) {
    if (pronto || Date.now() > limitePolling) break;
    await espera(intervalo);
    if (pronto || Date.now() > limitePolling) break;
    if (emVoo < 4) consultar();
  }
  while (!pronto && emVoo > 0 && Date.now() < limitePolling) await espera(250);

  const itens: any[] = [...(dados?.Aereos?.Items ?? [])];


  // Páginas restantes em paralelo (lotes de 4) — antes era uma requisição por vez.
  const metaFinal = dados?.Aereos?.MetaData;
  const faltam = paginasRestantes(metaFinal, porPagina, itens.length);
  const paginas = Array.from({ length: faltam }, (_, k) => k + 2);
  // Uma única rodada paralela com teto por página: em lotes sequenciais de 4,
  // cada rodada custava vários segundos e uma página lenta segurava tudo.
  if (paginas.length) {
    const respostas = await Promise.all(
      paginas.map((pagina) =>
        limitarEspera(
          chamarCompreFacil(
            `/api/Aereo/busca?Pagina=${pagina}&ItensPorPagina=${porPagina}`,
            { base, method: "POST", body: corpo(guid) },
          ),
          12_000,
        ).catch(() => null),
      ),
    );
    for (const r of respostas) {
      const its: any[] = (r?.dados as any)?.Aereos?.Items ?? [];
      itens.push(...its);
      if (itens.length >= MAX_ITENS) break;
    }
  }

  // guarda o JSON bruto da operadora: a reserva real precisa do objeto original
  const buscaToken = await guardarBuscaCF("aereo", itens);
  return itens
    .map((it, idx) => {
      const o = mapearOfertaAereo(it, idx);
      return o && buscaToken ? { ...o, buscaToken, buscaIndice: idx } : o;
    })
    .filter(Boolean) as PassHubOferta[];
}

const minutos = (dur: string) => {
  const [h, m] = String(dur || "").split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
};

function mapearVoo(seg: any, tarifa: { total: number; tarifa: number; taxas: number }): PassHubVoo {
  const voos: any[] = seg?.Voos ?? [];
  const primeiro = voos[0] ?? {};
  const ultimo = voos[voos.length - 1] ?? primeiro;
  const totalMin = voos.reduce((a, v) => a + minutos(v?.Duracao), 0);
  const bagagem = Number(seg?.BagagemQuantidade ?? 0);
  return {
    companhia: seg?.Fornecedor || primeiro?.CiaMarketing || "",
    companhiaIata: primeiro?.CiaMarketing || primeiro?.CiaOperacao || "",
    operadoPor: primeiro?.CiaOperacao || "",
    familiaTarifaria: seg?.FamiliaTarifaria || "",
    classe: primeiro?.ClasseTarifaria || "",
    origem: seg?.AeroportoPartida || primeiro?.AeroportoPartida || "",
    destino: seg?.AeroportoChegada || ultimo?.AeroportoChegada || "",
    partida: primeiro?.DataPartida || seg?.DataPartida || "",
    chegada: ultimo?.DataChegada || "",
    duracao: `${String(Math.floor(totalMin / 60)).padStart(2, "0")}h${String(totalMin % 60).padStart(2, "0")}`,
    duracaoMinutos: totalMin,
    numeroVoo: primeiro?.NumeroVoo || "",
    paradas: Math.max(0, voos.length - 1),
    escala: voos.length > 1 ? voos.slice(0, -1).map((v) => v?.AeroportoChegada).join(", ") : "",
    mudancaAeroporto: false,
    conexoes: voos.map((v) => ({
      companhia: v?.CiaMarketing || "",
      companhiaIata: v?.CiaMarketing || "",
      numeroVoo: v?.NumeroVoo || "",
      origem: v?.AeroportoPartida || "",
      origemNome: v?.AeroportoPartidaCidadeNome || v?.AeroportoPartidaNome || "",
      destino: v?.AeroportoChegada || "",
      destinoNome: v?.AeroportoChegadaCidadeNome || v?.AeroportoChegadaNome || "",
      partida: v?.DataPartida || "",
      chegada: v?.DataChegada || "",
      duracao: v?.Duracao || "",
      equipamento: v?.EquipamentoAereo || "",
      classe: v?.ClasseTarifaria || "",
    })) as any,
    bagagemDespachada: bagagem > 0,
    bagagemDespachadaQtd: bagagem,
    bagagemMao: seg?.BagagemDeBordo !== false,
    servicos: [],
    precoTotal: tarifa.total,
    precoTarifa: tarifa.tarifa,
    taxas: tarifa.taxas,
    ravValor: 0,
    ravPercentual: 0,
    incentivoValor: 0,
    incentivoPercentual: 0,
    provedor: seg?.Fornecedor || "",
    canal: "comprefacil",
    rateToken: "",
    parcelamento: [],
  };
}

function mapearOfertaAereo(it: any, idx: number): PassHubOferta | null {
  const segs: any[] = it?.Seguimentos ?? [];
  if (!segs.length) return null;
  const paxes: any[] = it?.PaxesTarifa ?? [];
  // SubTotal/TotalTaxas da CompreFácil já vêm somados para a quantidade de pax
  // daquela categoria — multiplicar por QtdPax dobrava o valor do aéreo.
  const total = paxes.reduce((a, p) => a + Number(p?.SubTotal ?? 0), 0);
  const taxas = paxes.reduce((a, p) => a + Number(p?.TotalTaxas ?? 0), 0);
  const tarifa = { total: Number(total.toFixed(2)), tarifa: Number((total - taxas).toFixed(2)), taxas: Number(taxas.toFixed(2)) };
  const [ida, ...voltas] = segs;
  return {
    id: `cf-${idx}-${it?.CiaValidadora ?? ""}-${segs[0]?.Voos?.[0]?.NumeroVoo ?? ""}`,
    precoTotal: tarifa.total,
    ida: mapearVoo(ida, tarifa),
    voltas: voltas.map((s) => mapearVoo(s, { total: 0, tarifa: 0, taxas: 0 })),
  };
}

/* --------------------------------- hotel --------------------------------- */

export type BuscaHotelCF = {
  cidadeId: number;
  checkin: string;
  checkout: string;
  adultos: number;
  criancas?: number;
  idades?: number[];
  /** distribuição real por quarto (Quarto 1 → 2 adultos, Quarto 2 → 2 adultos + 1 criança…) */
  quartos?: OcupacaoQuarto[];
  porPagina?: number;
};

/**
 * A operadora aceita uma linha por quarto pesquisado: `NumeroPesquisa` é o
 * índice do quarto e `Criancas` é a lista de idades (bebês entram como idade 0).
 */
function distribuicaoQuartos(p: BuscaHotelCF) {
  const lista = p.quartos?.length
    ? p.quartos
    : [{ adultos: Math.max(1, p.adultos || 1), criancas: p.criancas ?? 0, bebes: 0, idades: p.idades ?? [] }];
  return lista.map((q, i) => {
    const idades = [...(q.idades ?? [])];
    while (idades.length < (q.criancas ?? 0)) idades.push(7);
    for (let b = 0; b < (q.bebes ?? 0); b++) idades.push(0);
    return {
      NumeroPesquisa: i + 1,
      Qtde: 1,
      Adultos: Math.max(1, q.adultos || 1),
      Criancas: idades,
    };
  });
}

export async function buscarHotelDinamicoCF(p: BuscaHotelCF): Promise<HotelPacote[]> {
  const ses = await sessaoCompreFacil();
  const agenciaId = Number(ses.agenciaId ?? 0);
  const porPagina = p.porPagina ?? 100;
  const rota = `/api/Hotel/buscaasync?Pagina=1&ItensPorPagina=${porPagina}`;
  const base = COMPREFACIL_BASES.hotel;

  const corpo = (guid: string | null, ordenacao = "") => ({
    AgenciaId: agenciaId,
    Guid: guid,
    Nacionalidade: "BR",
    PacoteId: 0,
    EventoId: 0,
    SomentePromocao: false,
    BuscaPacote: true,
    BuscaEvento: false,
    FiltrarEstrelasWebService: false,
    EscreveLog: false,
    Checkin: p.checkin,
    Checkout: p.checkout,
    Cidade: { Id: p.cidadeId },
    Quartos: distribuicaoQuartos(p),
    FiltroHotel: { ...FILTRO_HOTEL, Ordenacao: ordenacao },
  });

  const inicio = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(null) });
  const guid = (inicio.dados as any)?.MetaData?.Guid as string | undefined;
  if (!guid) return [];

  let dados: any = inicio.dados;
  // A API pode alternar respostas preenchidas e vazias enquanto consolida os
  // fornecedores. Preservamos sempre o melhor lote já recebido para uma
  // resposta vazia posterior não apagar hotéis que estavam prontos.
  let melhorDados: any = inicio.dados;
  let melhorPontuacao = 0;
  // Polling adaptativo. Assim que há um lote útil com quartos reais, ele pode
  // ser entregue sem esperar fornecedores lentos terminarem todo o catálogo.
  const intervalos = [800, 900, 1000, 1200, 1200, 1400, 1600, 1800, 2000, 2200, 2500, 2500, 3000];
  const temQuartoReal = (d: any) =>
    ((d?.Items ?? []) as any[]).some((h) => (h?.Quartos ?? []).some((q: any) => typeof q?.Descricao === "string" && q.Descricao.trim()));
  const pontuar = (d: any) => {
    const itens = (d?.Items ?? []) as any[];
    const quartosReais = itens.reduce(
      (total, h) => total + ((h?.Quartos ?? []) as any[]).filter((q) => typeof q?.Descricao === "string" && q.Descricao.trim()).length,
      0,
    );
    return itens.length * 10 + quartosReais;
  };
  melhorPontuacao = pontuar(melhorDados);
  for (let i = 0; i < intervalos.length; i++) {
    await espera(intervalos[i]!);
    const r = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(guid) });
    dados = r.dados;
    const pontuacao = pontuar(dados);
    if (pontuacao > melhorPontuacao) {
      melhorDados = dados;
      melhorPontuacao = pontuacao;
    }
    const meta = dados?.MetaData;
    const total = Number(meta?.TotalItens ?? 0);
    if (buscasAtivas(meta) === 0 && total > 0 && temQuartoReal(dados)) break;
    if (buscasAtivas(meta) === 0 && i > 1) break;
    if (i >= 2 && total >= 40 && temQuartoReal(dados)) break;
  }
  dados = melhorDados;


  const chaveHotel = (h: any) => `${h?.CodigoFornecedor}-${h?.Fornecedor}-${h?.Nome}`;

  /** Junta os quartos de todas as passadas do mesmo hotel (sem duplicar). */
  const chaveQuarto = (q: any) =>
    `${q?.CodigoQuarto ?? ""}-${q?.CodigoPensao ?? ""}-${q?.Descricao ?? ""}-${q?.ValorVenda ?? ""}`;
  const acumular = (destino: any[], mapa: Map<string, any>, lote: any[]) => {
    for (const h of lote) {
      const chave = chaveHotel(h);
      const existente = mapa.get(chave);
      if (!existente) {
        mapa.set(chave, h);
        destino.push(h);
        continue;
      }
      const atuais: any[] = existente.Quartos ?? [];
      const vistosQ = new Set(atuais.map(chaveQuarto));
      for (const q of (h?.Quartos ?? []) as any[]) {
        const k = chaveQuarto(q);
        if (vistosQ.has(k)) continue;
        vistosQ.add(k);
        atuais.push(q);
      }
      existente.Quartos = atuais;
    }
  };

  // 1ª passada (Ordenacao "") = lista de "recomendados" da operadora — poucos itens,
  // usada só para marcar o selo. A lista completa vem na 2ª passada ordenada por preço.
  // Teto: a operadora só destaca os primeiros da vitrine; sem isso quase todo
  // hotel acabava marcado como "Recomendado".
  const primeiraPassada = (dados?.Items ?? []) as any[];
  const recomendados = new Set<string>(primeiraPassada.slice(0, 10).map(chaveHotel));

  // 2ª passada: mesma busca (mesmo Guid) ordenada do menor para o maior preço,
  // que é a única ordenação em que a operadora devolve o catálogo inteiro.
  // Todas as páginas saem juntas (antes a página 1 era esperada sozinha antes
  // das demais, somando alguns segundos a cada busca).
  const totalCatalogo = Number(dados?.MetaData?.TotalItens ?? 0);
  const totalPaginas = Math.min(
    Math.max(1, Math.ceil((totalCatalogo || porPagina) / porPagina)),
    6,
  );
  const respostasAsc = await Promise.all(
    Array.from({ length: totalPaginas }, (_, k) => k + 1).map((pagina) =>
      limitarEspera(
        chamarCompreFacil(
          `/api/Hotel/buscaasync?Pagina=${pagina}&ItensPorPagina=${porPagina}`,
          { base, method: "POST", body: corpo(guid, "asc") },
        ),
        10_000,
      ).catch(() => null),
    ),
  );
  const itens: any[] = [];
  const mapa = new Map<string, any>();
  let vazio = true;
  for (const r of respostasAsc) {
    const its: any[] = (r?.dados as any)?.Items ?? [];
    if (its.length) vazio = false;
    acumular(itens, mapa, its);
  }
  if (vazio) acumular(itens, mapa, (dados?.Items ?? []) as any[]);


  // a 1ª passada costuma trazer quartos que a ordenação por preço resume;
  // mesclamos para o cliente ver todas as acomodações disponíveis.
  acumular(itens, mapa, primeiraPassada);

  const buscaTokenH = await guardarBuscaCF("hotel", itens);
  return itens.map((h, i) => ({
    ...mapearHotel(h, i),
    ...(buscaTokenH ? { buscaToken: buscaTokenH, buscaIndice: i } : {}),
    recomendado: recomendados.has(chaveHotel(h)),
  }));
}

function limpar(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
}

/** Nome do quarto sem os avisos internos da operadora. */
function nomeQuarto(v: unknown): string | null {
  const t = limpar(v);
  if (!t) return null;
  const limpo = t
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\(\s*\d+\s*\)\s*$/, " ")
    .replace(/\s*[-–—,;]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return limpo || null;
}

/** Regime padronizado (a operadora manda "BedBreakfast", "Room Only"…). */
function regimeQuarto(q: any): string | null {
  const bruto = limpar(q?.DescricaoPensao) ?? limpar(q?.DescricaoPensaoOriginal);
  if (!bruto) return null;
  if (/bed\s*breakfast|caf[ée]/i.test(bruto)) return "Café da manhã";
  if (/room\s*only|sem\s*caf|alojament/i.test(bruto)) return "Só alojamento";
  if (/half\s*board|meia\s*pens/i.test(bruto)) return "Meia pensão";
  if (/full\s*board|pens[ãa]o\s*completa/i.test(bruto)) return "Pensão completa";
  if (/all\s*inclusive|tudo\s*inclu/i.test(bruto)) return "All inclusive";
  return bruto;
}

function mapearHotel(h: any, i: number): HotelPacote {
  // A operadora manda um "quarto resumo" (sem descrição e sem valor) enquanto a
  // busca ainda roda — ele nunca pode virar opção de acomodação para o cliente.
  const todos: any[] = h?.Quartos ?? [];
  const reais = todos.filter((q) => nomeQuarto(q?.Descricao) || Number(q?.ValorVenda ?? 0) > 0);
  const quartosBrutos: any[] = reais.length ? reais : todos;
  // Alguns fornecedores só preenchem ValorListagem/ValorTotalListagem; sem esse
  // fallback o hotel ficava com total 0 e todos apareciam com o mesmo preço.
  const precoQuarto = (q: any) =>
    Number(q?.ValorVenda ?? 0) || Number(q?.ValorTotalListagem ?? 0) || Number(q?.ValorListagem ?? 0) || 0;
  const valores = quartosBrutos.map(precoQuarto).filter((v) => v > 0);
  const menor = valores.length
    ? Math.min(...valores)
    : Number(h?.ValorTotalVenda ?? 0) || Number(h?.ValorTotalListagem ?? 0) || 0;

  const quartos: QuartoPacote[] = quartosBrutos.map((q, idx) => {
    const valor = precoQuarto(q);

    const politica = limpar(q?.PoliticaListagem ?? q?.Politica);
    const regime = regimeQuarto(q);
    const beneficios = [regime, limpar(q?.Observacao), limpar(q?.Facilidades)].filter(Boolean) as string[];
    return {
      id: `${q?.CodigoQuarto ?? idx}-${q?.CodigoPensao ?? idx}-${idx}`,
      nome: nomeQuarto(q?.Descricao) ?? "Standard",
      ocupacao: q?.Adultos
        ? `${q.Adultos} adulto(s)${Number(q?.Criancas ?? 0) ? ` · ${q.Criancas} criança(s)` : ""}`
        : null,
      regime,
      reembolsavel:
        typeof q?.Reembolsavel === "boolean"
          ? q.Reembolsavel
          : politica
            ? !/n[ãa]o\s+reembols/i.test(politica)
            : null,
      beneficios,
      politica,
      pesquisa: Number(q?.NumeroPesquisa ?? q?.Pesquisa ?? 0) || null,
      valor: Number(valor.toFixed(2)),
      diferenca: Number((valor - menor).toFixed(2)),
    };
  });


  const politicas = Array.from(new Set(quartos.map((q) => q.politica).filter(Boolean) as string[]));
  const comodidades = Array.from(
    new Set(
      ([] as string[])
        .concat(
          (h?.Facilidades ?? h?.Comodidades ?? [])
            .map?.((f: any) => limpar(typeof f === "string" ? f : f?.Descricao ?? f?.Nome))
            .filter(Boolean) ?? [],
        )
        .concat(quartos[0]?.regime ? [quartos[0].regime] : []),
    ),
  );

  return {
    posicao: i,
    id: `cfh-${i}-${h?.CodigoFornecedor ?? ""}-${h?.Fornecedor ?? ""}`,
    pacoteExternoId: Number(h?.CodigoFornecedor ?? 0) || 0,
    nome: limpar(h?.Nome) ?? "Hotel",
    categoria: typeof h?.Estrelas === "number" ? h.Estrelas : null,
    avaliacao: typeof h?.Avaliacao === "number" ? h.Avaliacao : null,
    numAvaliacoes: typeof h?.QuantidadeAvaliacoes === "number" ? h.QuantidadeAvaliacoes : null,
    localizacao: limpar(h?.Bairro ?? h?.CidadeNome ?? h?.Endereco),
    endereco: limpar(h?.Endereco),
    descricao: limpar(h?.Descricao ?? h?.DescricaoHotel ?? h?.Observacao),
    comodidades,
    politicas,
    fotos: h?.HotelImagem ? [String(h.HotelImagem)] : [],
    beneficios: comodidades.slice(0, 6),
    regime: quartos[0]?.regime ?? null,
    reembolsavel: quartos[0]?.reembolsavel ?? null,
    total: Number(menor.toFixed(2)),
    moeda: "BRL",
    quartos,
  };
}
