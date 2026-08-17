/** Tipos normalizados do conector Omio (somente leitura / pesquisa). */

export type OmioPosition = {
  id: string;
  nome: string;
  tipo: string;
  pais?: string;
};

export type OmioPreco = {
  valor: number;
  moeda: string;
};

export type OmioSegmento = {
  transportadora?: string;
  numero?: string;
  origem?: string;
  destino?: string;
  partida?: string;
  chegada?: string;
};

export type OmioResultado = {
  id: string;
  searchId: string;
  modo: string;
  origem: string;
  destino: string;
  partida: string;
  chegada: string;
  duracaoMinutos?: number;
  conexoes: number;
  transportadoras: string[];
  preco?: OmioPreco;
  segmentos: OmioSegmento[];
  urlDetalhe?: string;
};

export type OmioBusca = {
  searchId: string;
  urlResultados: string;
  resultados: OmioResultado[];
  diagnostico: string[];
};

export type OmioTarifa = {
  id: string;
  nome: string;
  descricao?: string;
  preco?: OmioPreco;
  diferenca?: OmioPreco;
  reembolsavel?: boolean;
  trocavel?: boolean;
  termos: string[];
};

export type OmioExtra = {
  id: string;
  nome: string;
  descricao?: string;
  preco?: OmioPreco;
};

export type OmioDetalhe = {
  searchId: string;
  journeyId: string;
  url: string;
  resumo?: OmioResultado;
  tarifas: OmioTarifa[];
  extras: OmioExtra[];
  bruto?: unknown;
  diagnostico: string[];
};
