import type { ReactNode } from "react";
import type { ComboFlightBookingData, ComboHotelBookingData } from "@/lib/onertravel-combo.functions";

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
  /** Dados crus da reserva — usados para gerar UM único carrinho combinado */
  flightBooking?: ComboFlightBookingData;
  hotelBooking?: ComboHotelBookingData;
  /** Card visual completo (mesmo card das buscas de aéreo/hotel) */
  card?: ReactNode;
};
