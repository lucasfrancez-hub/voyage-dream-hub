/**
 * Contrato interno de hotelaria da VIA AIR.
 *
 * O portal consome SOMENTE este formato. Hoje ele é alimentado pelo
 * `ExpediaTaapBrowserProvider` (navegador automatizado numa sessão TAAP
 * autenticada); no futuro pelo `ExpediaRapidProvider` (API oficial).
 * Trocar a fonte não pode exigir mudança no front-end.
 */

export type HotelProviderId = "EXPEDIA";
export type HotelSourceId = "EXPEDIA_TAAP" | "EXPEDIA_RAPID";

export type HotelSearchType = "HOTEL_STANDALONE" | "FLIGHT_HOTEL_PACKAGE";

/** Estados internos padronizados — nunca expor erro técnico bruto ao cliente. */
export type HotelSearchStatus =
  | "SUCCESS"
  | "NO_RESULTS"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "TAAP_UNAVAILABLE"
  | "CAPTCHA_REQUIRED"
  | "RATE_CHANGED"
  | "ROOM_UNAVAILABLE"
  | "TIMEOUT"
  | "PARSER_ERROR";

/** Mensagens amigáveis (pt-BR) para cada estado. */
export const HOTEL_STATUS_MESSAGE: Record<HotelSearchStatus, string> = {
  SUCCESS: "Busca concluída.",
  NO_RESULTS: "Nenhuma hospedagem disponível para esse período.",
  AUTH_REQUIRED: "A conexão com a operadora precisa ser reconectada.",
  SESSION_EXPIRED: "A conexão com a operadora expirou. Reconecte para continuar.",
  TAAP_UNAVAILABLE: "A operadora está indisponível no momento. Tente novamente em instantes.",
  CAPTCHA_REQUIRED: "A operadora pediu uma verificação de segurança. Reconecte a sessão.",
  RATE_CHANGED: "A tarifa mudou. Refaça a consulta para ver o valor atual.",
  ROOM_UNAVAILABLE: "Essa acomodação não está mais disponível.",
  TIMEOUT: "A operadora demorou demais para responder. Tente novamente.",
  PARSER_ERROR: "Não foi possível ler os resultados da operadora.",
};

export type HotelPrice = {
  currency: string | null;
  nightly: number | null;
  total: number | null;
};

export type HotelResult = {
  source: HotelSourceId;
  search_id: string | null;
  property_id: string | null;
  name: string;
  destination: string | null;
  image: string | null;
  rating: number | null;
  review_score: number | null;
  review_count: number | null;
  price: HotelPrice;
  detail_url: string | null;
  available: boolean;
};

export type HotelRoom = {
  room_type_id: string | null;
  rate_plan_id: string | null;
  name: string;
  beds: string | null;
  occupancy: number | null;
  meal: string | null;
  refundable: boolean | null;
  cancellation_text: string | null;
  pay_later: boolean | null;
  price: HotelPrice & { taxes: number | null };
  commission: { currency: string | null; amount: number | null; percent: number | null } | null;
  /** Somente o que a tela/dados mostram — nunca calculamos parcelas. */
  installments:
    | {
        available: boolean;
        max_installments: number | null;
        plans: Array<{ count: number; amount: number | null }>;
      }
    | null;
  select_action: string | null;
};

export type HotelRoomsResult = {
  source: HotelSourceId;
  property_id: string;
  search_id: string | null;
  rooms: HotelRoom[];
};

export type HotelSearchQuery = {
  type?: HotelSearchType;
  destination: string;
  /** yyyy-mm-dd */
  startDate: string;
  /** yyyy-mm-dd */
  endDate: string;
  rooms?: number;
  adults?: number;
  children?: number;
  regionId?: string | null;
  latLong?: string | null;
  /** ignora cache de 5 minutos */
  refresh?: boolean;
};

export type HotelSearchResponse = {
  provider: HotelProviderId;
  status: HotelSearchStatus;
  message: string;
  search_id: string | null;
  cached: boolean;
  results: HotelResult[];
};

/** Toda fonte de dados (robô hoje, API oficial amanhã) implementa isto. */
export interface HotelSearchProvider {
  readonly id: HotelProviderId;
  readonly source: HotelSourceId;
  search(query: HotelSearchQuery): Promise<HotelSearchResponse>;
}
