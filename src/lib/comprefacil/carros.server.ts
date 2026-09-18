/**
 * Chamadas cruas de LOCAÇÃO DE CARRO no Compre Fácil (aba Carro).
 *
 * Endpoints reais confirmados em auditoria (base principal `api.comprefacil.tur.br`):
 *  - GET  /api/lojascarro/list/{texto}   → lojas/cidades de retirada e devolução
 *  - POST /api/carro/buscaasync          → abre a busca (assíncrona)
 *  - POST /api/Carro/busca               → consulta o resultado pelo mesmo Guid
 *
 * O retorno traz `TaxaAdmPercentual` (taxa administrativa da operadora) e um
 * `MarkupId` interno. NENHUM dos dois é comissão da agência: o Compre Fácil não
 * devolve comissão em campo próprio. Ver o bloco `precificacao` no adapter.
 *
 * SERVER-ONLY.
 */
import { chamarCompreFacil, sessaoCompreFacil } from "@/lib/comprefacil/auth.server";

export type LojaCarroCF = {
  sigla: string;
  nome: string;
  endereco: string | null;
  tipo: string; // "C" = loja, "A" = cidade/aeroporto
  cidadeId: number | null;
  principal: boolean;
};

export type ProtecaoCarroCF = {
  Codigo?: string;
  Titulo?: string;
  Descricao?: string;
  Tipo?: string;
  ValorVenda?: number;
  ValorNet?: number;
  TaxaAdm?: number;
  ProtecaoObrigatoria?: boolean;
};

export type CarroCF = {
  Id?: number;
  ItemGuid?: string;
  CodigoInterno?: string;
  Fornecedor?: string;
  Descricao?: string;
  Codigo?: string;
  CodigoCliente?: string;
  ModeloCodigo?: string;
  ModeloNome?: string;
  Categoria?: string;
  Pax?: number;
  Bagagem?: number;
  Portas?: number;
  TemAirCondicionado?: boolean;
  KmLivre?: boolean;
  TransmissaoTipo?: string;
  Imagem?: string;
  LocalOrigem?: string;
  LocalDevolucao?: string;
  EnderecoOrigem?: string;
  EnderecoDevolucao?: string;
  DataHoraOrigem?: string;
  DataHoraDevolucao?: string;
  CondutorDocumentoTipo?: string;
  PagamentoCodigo?: string;
  WebServiceId?: number;
  MarkupId?: number;
  Extra?: string;
  Offline?: boolean;
  ValorDiarias?: number;
  ValorVenda?: number;
  ValorListagem?: number;
  ValorTotalListagem?: number;
  TaxaAdm?: number;
  TaxaExtra?: number;
  TaxaAdmPercentual?: number;
  ValorProtecoes?: number;
  Protecoes?: ProtecaoCarroCF[];
  MoedaListagem?: { Sigla?: string };
};

type RespostaBusca = {
  MetaData?: {
    TotalItens?: number;
    TotalPaginas?: number;
    Guid?: string;
    BuscasAtivas?: string;
    MetaDados?: string;
  };
  Items?: CarroCF[];
};

/** Lojas/cidades de retirada e devolução por texto livre. */
export async function lojasCarroCF(texto: string, limite = 20): Promise<LojaCarroCF[]> {
  const termo = encodeURIComponent(texto.trim());
  const path = termo
    ? `/api/lojascarro/list/${termo}?Pagina=1&ItensPorPagina=${limite}`
    : `/api/lojascarro?Pagina=1&ItensPorPagina=${limite}`;
  const r = await chamarCompreFacil(path);
  if (!r.ok) return [];
  const itens = ((r.dados as { Items?: Record<string, unknown>[] })?.Items ?? []) as Record<
    string,
    unknown
  >[];
  return itens.map((i) => ({
    sigla: String(i["Sigla"] ?? ""),
    nome: String(i["Nome"] ?? "").trim(),
    endereco: (i["Endereco"] as string) ?? null,
    tipo: String(i["Tipo"] ?? "C"),
    cidadeId: (i["CidadeId"] as number) ?? null,
    principal: Boolean(i["Principal"]),
  }));
}

export type ParamsBuscaCarroCF = {
  localOrigem: string;
  localDevolucao: string;
  tipoOrigem: string;
  tipoDevolucao: string;
  displayOrigem?: string | null;
  displayDevolucao?: string | null;
  cidadeOrigemId?: number | null;
  cidadeDevolucaoId?: number | null;
  /** AAAA-MM-DDTHH:mm:ss */
  dataHoraRetirada: string;
  dataHoraDevolucao: string;
  adultos: number;
  idadesCriancas: number[];
  itensPorPagina?: number;
};

function corpo(p: ParamsBuscaCarroCF, agenciaId: number, guid: string) {
  return {
    LocalOrigem: p.localOrigem,
    LocalDevolucao: p.localDevolucao,
    localOrigemTipo: p.tipoOrigem,
    localDevolucaoTipo: p.tipoDevolucao,
    LocalOrigemDisplay: p.displayOrigem ?? p.localOrigem,
    LocalDevolucaoDisplay: p.displayDevolucao ?? p.localDevolucao,
    DataHoraOrigem: p.dataHoraRetirada,
    DataHoraDevolucao: p.dataHoraDevolucao,
    AgenciaId: agenciaId,
    Guid: guid,
    Adt: p.adultos,
    IdadesChd: p.idadesCriancas,
    EscreveLog: false,
    Cidade: { Id: p.cidadeOrigemId ?? 0 },
    CidadeOrigem: { Id: p.cidadeOrigemId ?? 0 },
    CidadeDevolucao: { Id: p.cidadeDevolucaoId ?? p.cidadeOrigemId ?? 0 },
  };
}

const ESPERA_MS = 3000;
const TENTATIVAS = 10;

/**
 * Abre a busca assíncrona e aguarda as locadoras responderem.
 * A espera acontece aqui, no servidor: o Sky Hub recebe a lista pronta.
 */
export async function buscarCarrosCF(
  p: ParamsBuscaCarroCF,
): Promise<{ guid: string; itens: CarroCF[]; total: number; fornecedores: string[] }> {
  const sessao = await sessaoCompreFacil();
  const agenciaId = Number(sessao.agenciaId ?? 0) || 8408;
  const itensPorPagina = Math.min(Math.max(p.itensPorPagina ?? 50, 1), 100);
  const guidInicial = crypto.randomUUID();

  const abertura = await chamarCompreFacil(
    `/api/carro/buscaasync?Pagina=1&ItensPorPagina=${itensPorPagina}`,
    { method: "POST", body: corpo(p, agenciaId, guidInicial) },
  );
  if (!abertura.ok) {
    const msg = (abertura.dados as { mensagem?: string })?.mensagem;
    throw new Error(msg ? `Operadora recusou a busca de carro: ${msg}` : "Falha ao buscar carros na operadora.");
  }
  const guid = (abertura.dados as RespostaBusca)?.MetaData?.Guid ?? guidInicial;

  let itens: CarroCF[] = [];
  let total = 0;
  let fornecedores: string[] = [];
  for (let i = 0; i < TENTATIVAS; i++) {
    await new Promise((r) => setTimeout(r, ESPERA_MS));
    const r = await chamarCompreFacil(
      `/api/Carro/busca?Pagina=1&ItensPorPagina=${itensPorPagina}`,
      { method: "POST", body: corpo(p, agenciaId, guid) },
    );
    if (!r.ok) continue;
    const dados = r.dados as RespostaBusca;
    total = dados?.MetaData?.TotalItens ?? 0;
    itens = dados?.Items ?? [];
    let ativas: string[] = [];
    try {
      ativas = JSON.parse(dados?.MetaData?.BuscasAtivas ?? "[]");
    } catch {
      ativas = [];
    }
    try {
      const meta = JSON.parse(dados?.MetaData?.MetaDados ?? "null");
      if (meta?.Fornecedores) fornecedores = meta.Fornecedores;
    } catch {
      /* metadados opcionais */
    }
    // Sem locadoras pendentes: resultado final.
    if (ativas.length === 0 && total > 0) break;
    if (ativas.length === 0 && i >= 2) break;
  }

  return { guid, itens, total, fornecedores };
}
