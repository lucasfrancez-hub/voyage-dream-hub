/** Reserva aérea originada de um pedido (client-safe). */
export type ReservaAereaPedido = {
  orderId: string;
  orderNumber: string;
  cliente: string;
  consultor: string;
  localizador: string;
  localizadorCompanhia: string;
  companhia: string;
  origem: string;
  destino: string;
  dataIda: string;
  dataVolta: string;
  criadaEm: string;
  status: string;
  total: number;
  passageiros: string[];
  bilhetes: string[];
};
