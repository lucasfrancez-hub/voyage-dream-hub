// Tipos compartilhados do catálogo Cativa (Viajando com Desconto).
// Browser-safe: sem imports de servidor.

export type CativaFonte = "tradicionais" | "eventos" | "internacionais";

export type CativaHotel = {
  nome: string;
  valor: number | null;
  taxas: number | null;
  crianca: string | null;
  regime: string | null;
  promocao: string | null;
};

export type CativaIngresso = {
  categoria: string;
  valor: number | null;
};

export type CativaPacoteNormalizado = {
  fonte: CativaFonte;
  categoria: string | null;
  nome: string;
  nome_normalizado: string;
  origem_iata: string | null;
  origem_cidade: string | null;
  destino: string | null;
  data_viagem: string | null; // YYYY-MM-DD
  data_fim: string | null;
  data_viagem_texto: string | null;
  outras_datas: string[];
  noites: number | null;
  token_infotravel: string | null;
  link_orcamento: string | null;
  aereo_de: number | null;
  aereo_por: number | null;
  taxas: number | null;
  valor_total: number | null;
  hoteis: CativaHotel[];
  ingressos: CativaIngresso[];
  incluso: string[];
  observacao: string | null;
  cotado_em: string | null;
  extras: Record<string, string>;
  source_row_key: string | null;
  fingerprint: string;
  content_hash: string;
};

/** Campos comerciais monitorados — mudança neles gera histórico. */
export const CAMPOS_COMERCIAIS = [
  "aereo_de",
  "aereo_por",
  "taxas",
  "valor_total",
  "data_viagem",
  "data_fim",
  "outras_datas",
  "noites",
  "hoteis",
  "ingressos",
  "incluso",
  "observacao",
  "link_orcamento",
  "categoria",
  "destino",
] as const;

export type CampoComercial = (typeof CAMPOS_COMERCIAIS)[number];

/** Campos cuja alteração exige reconsulta na Infotravel. */
export const CAMPOS_QUE_EXIGEM_INFOTRAVEL: CampoComercial[] = [
  "aereo_por",
  "taxas",
  "data_viagem",
  "data_fim",
  "hoteis",
  "link_orcamento",
];
