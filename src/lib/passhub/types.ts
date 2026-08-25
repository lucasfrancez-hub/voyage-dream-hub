/** Tipos do motor PassHub (client-safe: usados na UI e no normalizador). */

export type PassHubConexao = {
  aeroporto: string;
  chegada: string;
  saida: string;
  duracao: string;
  mudancaAeroporto: boolean;
};

export type PassHubServico = { tipo: string; incluso: boolean; descricao: string };

export type PassHubParcelamento = { bandeira: string; maxParcelas: number; motivos: string[] };

export type PassHubVoo = {
  companhia: string;
  companhiaIata: string;
  operadoPor: string;
  familiaTarifaria: string;
  classe: string;
  origem: string;
  destino: string;
  partida: string;
  chegada: string;
  duracao: string;
  duracaoMinutos: number;
  numeroVoo: string;
  paradas: number;
  escala: string;
  mudancaAeroporto: boolean;
  conexoes: PassHubConexao[];
  bagagemDespachada: boolean;
  bagagemDespachadaQtd: number;
  bagagemMao: boolean;
  /** Peso da bagagem despachada em kg (FRT: `BagagemPeso`), quando informado. */
  bagagemPeso?: number;
  /** Item pessoal / mochila (FRT: `Mochila`). */
  mochila?: boolean;

  servicos: PassHubServico[];
  precoTotal: number;
  precoTarifa: number;
  taxas: number;
  /** Valor de RAV informado pela PassHub, quando disponível. */
  ravValor: number;
  /** Percentual de RAV informado pela PassHub, quando disponível. */
  ravPercentual: number;
  /** Comissão de incentivo informada pela PassHub (R$), quando disponível. */
  incentivoValor: number;
  /** Percentual da comissão de incentivo informado pela PassHub. */
  incentivoPercentual: number;
  provedor: string;
  canal: string;
  rateToken: string;
  parcelamento: PassHubParcelamento[];
};

export type PassHubOferta = {
  id: string;
  precoTotal: number;
  /** token da busca na operadora (CompreFácil/FRT) — usado para reservar de verdade */
  buscaToken?: string;
  /** índice do item bruto dentro da busca guardada */
  buscaIndice?: number;
  ida: PassHubVoo;
  voltas: PassHubVoo[];
};

export type PassHubResultado = {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
  companhias: string[];
  familias: string[];
  precoMin: number;
  precoMax: number;
  ofertas: PassHubOferta[];
};

/* ------------------------- reserva (tarifar/reservar) ------------------------- */

export type PassHubPaxTipo = "ADT" | "CHD" | "INF";

export type PassHubPax = {
  tipo: PassHubPaxTipo;
  nome: string;
  sobrenome: string;
  /** aaaa-mm-dd */
  nascimento: string;
  genero: "M" | "F";
  documentoTipo: "cpf" | "passport";
  documento: string;
  paisEmissor?: string;
  paisResidencia?: string;
  /** Passaporte: aaaa-mm-dd */
  emissao?: string;
  validade?: string;
  email?: string;
  ddi?: string;
  ddd?: string;
  telefone?: string;
};

export type PassHubTarifacao = {
  pricedRateTokens: string[];
  preco: number;
  precoSemTaxa: number;
  /** Comissão total em R$ (RAV efetiva + incentivo do nível). */
  ravValor: number;
  /** Só a RAV efetiva devolvida pela PassHub, sem o incentivo. */
  ravSemIncentivo?: number;
  /** Incentivo do nível de recompensas em R$ (tarifa base x pct). */
  incentivoValor?: number;
  /** Percentual do incentivo do nível vigente. */
  incentivoPercentual?: number;
  ravModo: string;
  retarifou: boolean;
};

export type PassHubReserva = {
  localizador: string;
  localizadorCompanhia: string;
  bookingId: string;
  bookingToken: string;
  status: string;
  total: number;
  totalSemTaxa: number;
};

/* ------------------------- reservas da agência (lista) ------------------------- */

export type PassHubReservaConexao = {
  origem: string;
  destino: string;
  partida: string;
  chegada: string;
  duracao: string;
  numeroVoo: string;
  familiaTarifaria: string;
  classe: string;
  companhia: string;
};

export type PassHubReservaSegmento = {
  origem: string;
  destino: string;
  partida: string;
  chegada: string;
  duracao: string;
  bagagemMao: boolean;
  bagagemDespachada: boolean;
  bagagemDespachadaQtd: number;
  conexoes: PassHubReservaConexao[];
};

export type PassHubReservaPax = {
  nome: string;
  documentoTipo: string;
  documento: string;
  nascimento: string;
  genero: string;
  tipo: string;
  telefone: string;
};

export type PassHubReservaLista = {
  idPassagem: number;
  localizador: string;
  localizadorCompanhia: string;
  status: string;
  statusDescricao: string;
  origem: string;
  destino: string;
  dataIda: string;
  dataVolta: string;
  criadaEm: string;
  limiteEmissao: string;
  emitidaEm: string;
  preco: number;
  precoSemTaxa: number;
  taxas: number;
  ravPercentual: number;
  ravValor: number;
  comissao: number;
  companhia: string;
  provedor: string;
  emissor: string;
  whatsapp: string;
  linkPagamento: string;
  multitrecho: boolean;
  passageiros: string[];
  /** Dados completos dos passageiros gravados na reserva (quando existirem). */
  passageirosDetalhe: PassHubReservaPax[];
  /** Comissão extra (RAV por fora) definida por nós, interna à agência. */
  comissaoExtra: number;
  /** Observação interna da comissão extra. */
  comissaoExtraObs: string;
  /** Total efetivamente cobrado do cliente: líquido da consolidadora + comissão + comissão extra. */
  totalVenda: number;
  segmentos: PassHubReservaSegmento[];
};
