/** Tipos normalizados do conector Sabre (client-safe). */

export type SabreAmbiente = "cert" | "prod";

export type SabreTrecho = {
  origem: string;
  destino: string;
  /** ISO yyyy-mm-dd */
  data: string;
};

export type SabreBuscaInput = {
  trechos: SabreTrecho[];
  adultos: number;
  criancas?: number;
  bebes?: number;
  /** Y | S | C | F */
  cabine?: "Y" | "S" | "C" | "F";
  companhia?: string | null;
  somenteDiretos?: boolean;
  maxResultados?: number;
  moeda?: string;
};

export type SabreSegmento = {
  companhia: string;
  companhiaOperadora?: string | null;
  voo: string;
  origem: string;
  destino: string;
  /** ISO local, ex.: 2026-11-10T22:35 */
  partida: string;
  chegada: string;
  duracaoMin: number;
  cabine?: string | null;
  classeTarifaria?: string | null;
  equipamento?: string | null;
};

export type SabrePerna = {
  origem: string;
  destino: string;
  partida: string;
  chegada: string;
  duracaoMin: number;
  paradas: number;
  segmentos: SabreSegmento[];
};

export type SabreBagagem = {
  pecas?: number | null;
  peso?: number | null;
  unidade?: string | null;
  descricao?: string | null;
};

export type SabreOferta = {
  /** Chave interna para encadear tarifação/reserva. */
  chave: string;
  companhia: string;
  moeda: string;
  tarifa: number;
  taxas: number;
  total: number;
  totalPorPassageiro: number;
  passageiros: number;
  reembolsavel?: boolean | null;
  familiaTarifaria?: string | null;
  bagagem?: SabreBagagem | null;
  pernas: SabrePerna[];
};

export type SabreBuscaResultado = {
  ambiente: SabreAmbiente;
  moeda: string;
  totalOfertas: number;
  ofertas: SabreOferta[];
  aviso?: string | null;
};

export type SabrePassageiro = {
  nome: string;
  sobrenome: string;
  tipo: "ADT" | "CHD" | "INF";
  /** yyyy-mm-dd */
  nascimento?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
};

export type SabrePnrResultado = {
  localizador: string;
  criadoEm: string;
  /** JSON bruto (só em CERT), já serializado. */
  bruto?: string | null;
};
