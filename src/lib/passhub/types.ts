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
  servicos: PassHubServico[];
  precoTotal: number;
  precoTarifa: number;
  taxas: number;
  provedor: string;
  canal: string;
  rateToken: string;
  parcelamento: PassHubParcelamento[];
};

export type PassHubOferta = {
  id: string;
  precoTotal: number;
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
