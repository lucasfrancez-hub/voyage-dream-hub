/** Seleção de uma etapa do modo Aéreo + Hotel (aéreo ou hospedagem). */
export type ComboPick = {
  /** Título curto (ex.: "CWB → GRU • ida e volta") */
  title: string;
  /** Resumo textual usado no pedido */
  summary: string;
  /** Valor total da etapa */
  total: number;
  /** Gera o carrinho "Comprar viagem" da operadora e devolve a URL */
  buy: () => Promise<string>;
};
