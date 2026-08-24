/**
 * Motor dinâmico da CompreFácil (Busca Fácil).
 *
 * Não usa pacote pronto: consulta a malha aérea e a listagem de hotéis da
 * própria operadora, com o protocolo assíncrono dela (Guid + polling até
 * `BuscasAtivas` esvaziar).
 */
import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "./auth.server";
import type { PassHubOferta, PassHubVoo } from "@/lib/passhub/types";
import type { HotelPacote, QuartoPacote } from "@/lib/pacote-motor/mapear";

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

  const porPagina = p.porPagina ?? 50;
  const rota = `/api/Aereo/busca?Pagina=1&ItensPorPagina=${porPagina}`;
  const base = COMPREFACIL_BASES.aereo;

  const inicio = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(null) });
  const guid = (inicio.dados as any)?.Aereos?.MetaData?.Guid as string | undefined;
  if (!guid) return [];

  let dados: any = inicio.dados;
  for (let i = 0; i < 12; i++) {
    await espera(3000);
    const r = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(guid) });
    dados = r.dados;
    const meta = dados?.Aereos?.MetaData;
    if (buscasAtivas(meta) === 0 && (dados?.Aereos?.Items?.length ?? 0) >= 0 && Number(meta?.TotalItens ?? 0) > 0) break;
    if (buscasAtivas(meta) === 0 && i > 1) break;
  }

  const itens: any[] = dados?.Aereos?.Items ?? [];
  return itens.map((it, idx) => mapearOfertaAereo(it, idx)).filter(Boolean) as PassHubOferta[];
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
  porPagina?: number;
};

export async function buscarHotelDinamicoCF(p: BuscaHotelCF): Promise<HotelPacote[]> {
  const ses = await sessaoCompreFacil();
  const agenciaId = Number(ses.agenciaId ?? 0);
  const porPagina = p.porPagina ?? 30;
  const rota = `/api/Hotel/buscaasync?Pagina=1&ItensPorPagina=${porPagina}`;
  const base = COMPREFACIL_BASES.hotel;

  const corpo = (guid: string | null) => ({
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
    Quartos: [
      {
        NumeroPesquisa: 1,
        Qtde: 1,
        Adultos: Math.max(1, p.adultos || 1),
        Criancas: p.idades ?? [],
      },
    ],
    FiltroHotel: FILTRO_HOTEL,
  });

  const inicio = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(null) });
  const guid = (inicio.dados as any)?.MetaData?.Guid as string | undefined;
  if (!guid) return [];

  let dados: any = inicio.dados;
  for (let i = 0; i < 12; i++) {
    await espera(3000);
    const r = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(guid) });
    dados = r.dados;
    const meta = dados?.MetaData;
    if (buscasAtivas(meta) === 0 && Number(meta?.TotalItens ?? 0) > 0) break;
    if (buscasAtivas(meta) === 0 && i > 1) break;
  }

  const itens: any[] = dados?.Items ?? [];
  return itens.map((h, i) => mapearHotel(h, i));
}

function mapearHotel(h: any, i: number): HotelPacote {
  const quartosBrutos: any[] = h?.Quartos ?? [];
  const valores = quartosBrutos.map((q) => Number(q?.ValorVenda ?? 0)).filter((v) => v > 0);
  const menor = valores.length ? Math.min(...valores) : Number(h?.ValorTotalVenda ?? 0);

  const quartos: QuartoPacote[] = quartosBrutos.map((q, idx) => ({
    id: `${q?.CodigoQuarto ?? idx}-${q?.CodigoPensao ?? idx}-${idx}`,
    nome: q?.Descricao ?? `Acomodação ${idx + 1}`,
    ocupacao: q?.Adultos ? `${q.Adultos} adulto(s)${q?.Criancas ? ` · ${q.Criancas} criança(s)` : ""}` : null,
    regime: q?.DescricaoPensao ?? null,
    reembolsavel: typeof q?.Reembolsavel === "boolean" ? q.Reembolsavel : null,
    beneficios: q?.PoliticaListagem ? [String(q.PoliticaListagem)] : [],
    diferenca: Number((Number(q?.ValorVenda ?? 0) - menor).toFixed(2)),
  }));

  return {
    id: `cfh-${i}-${h?.CodigoFornecedor ?? ""}-${h?.Fornecedor ?? ""}`,
    pacoteExternoId: Number(h?.CodigoFornecedor ?? 0) || 0,
    nome: h?.Nome ?? "Hotel",
    categoria: typeof h?.Estrelas === "number" ? h.Estrelas : null,
    avaliacao: null,
    localizacao: h?.Endereco ?? null,
    fotos: h?.HotelImagem ? [String(h.HotelImagem)] : [],
    beneficios: quartos[0]?.regime ? [quartos[0].regime] : [],
    regime: quartos[0]?.regime ?? null,
    reembolsavel: quartos[0]?.reembolsavel ?? null,
    total: Number(menor.toFixed(2)),
    moeda: "BRL",
    quartos,
  };
}
