/**
 * Modelo normalizado de orçamento importado (Infotravel e futuras operadoras).
 * Nada de comissão, markup, custo ou credencial aqui — este objeto alimenta
 * tanto a tela interna quanto o orçamento público Via Air.
 */

export type QuoteSource = "INFOTRAVEL" | "MANUAL" | "BRUNO" | "PAULA" | "IMPORTADO";

export type QuoteStatus =
  | "DRAFT"
  | "IMPORTING"
  | "READY"
  | "SENT"
  | "VIEWED"
  | "INTERESTED"
  | "CONVERTED"
  | "EXPIRED"
  | "CANCELLED"
  | "IMPORT_ERROR";

export type NormalizedHotel = {
  name: string;
  city?: string | null;
  address?: string | null;
  checkin?: string | null;
  checkout?: string | null;
  nights?: number | null;
  roomDescription?: string | null;
  board?: string | null;
  photos?: string[];
  latitude?: number | null;
  longitude?: number | null;
  total?: number | null;
};

export type NormalizedFlightSegment = {
  airline?: string | null;
  airlineIata?: string | null;
  flightNumber?: string | null;
  fromIata?: string | null;
  fromCity?: string | null;
  toIata?: string | null;
  toCity?: string | null;
  departure?: string | null;
  arrival?: string | null;
  duration?: string | null;
  cabin?: string | null;
  fareClass?: string | null;
  aircraft?: string | null;
  terminal?: string | null;
  baggage?: string | null;
};

export type NormalizedFlight = {
  direction?: "OUTBOUND" | "INBOUND" | null;
  airline?: string | null;
  fromIata?: string | null;
  toIata?: string | null;
  departure?: string | null;
  arrival?: string | null;
  duration?: string | null;
  stops?: number | null;
  segments: NormalizedFlightSegment[];
  total?: number | null;
};

export type NormalizedGenericItem = {
  name: string;
  description?: string | null;
  date?: string | null;
  quantity?: number | null;
  total?: number | null;
};

/** Conjunto de produtos/valores de UMA opção comercial do orçamento. */
export type NormalizedOption = {
  optionNumber: number;
  label?: string | null;
  /** Quando true, a opção é um ROTEIRO: exibida em ordem cronológica. */
  itinerary?: boolean | null;
  startDate?: string | null;
  endDate?: string | null;
  destination?: string | null;
  hotels: NormalizedHotel[];
  flights: NormalizedFlight[];
  cars: NormalizedGenericItem[];
  transfers: NormalizedGenericItem[];
  activities: NormalizedGenericItem[];
  tickets: NormalizedGenericItem[];
  insurance: NormalizedGenericItem[];
  services: NormalizedGenericItem[];
  total?: number | null;
  currency?: string | null;
  paymentConditions?: string[] | null;
  notes?: string[] | null;
  sourceReference?: string | null;
};

export type NormalizedQuote = {
  source: QuoteSource;
  sourceId?: string | null;
  sourceUrl?: string | null;
  sourceBookingId?: string | null;
  sourceBookingIndex?: string | null;
  sourceCompanyCode?: string | null;
  sourceToken?: string | null;
  title?: string | null;
  /** Título comercial exibido no orçamento público (editável no admin). */
  headline?: string | null;
  agency?: string | null;
  agent?: string | null;
  client?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  passengers?: { adults?: number; children?: number; infants?: number; names?: string[] } | null;
  startDate?: string | null;
  endDate?: string | null;
  origin?: string | null;
  destination?: string | null;
  /** Produtos da opção 1 (compatibilidade). A verdade completa está em `options`. */
  hotels: NormalizedHotel[];
  flights: NormalizedFlight[];
  cars: NormalizedGenericItem[];
  transfers: NormalizedGenericItem[];
  activities: NormalizedGenericItem[];
  tickets: NormalizedGenericItem[];
  insurance: NormalizedGenericItem[];
  services: NormalizedGenericItem[];
  /** Todas as opções comerciais encontradas na mesma URL. Sempre com pelo menos 1. */
  options: NormalizedOption[];
  values?: { subtotal?: number | null; taxes?: number | null } | null;
  total?: number | null;
  currency?: string | null;
  paymentConditions?: string[] | null;
  notes?: string[] | null;
};

export function emptyOption(optionNumber = 1): NormalizedOption {
  return {
    optionNumber,
    hotels: [],
    flights: [],
    cars: [],
    transfers: [],
    activities: [],
    tickets: [],
    insurance: [],
    services: [],
  };
}

export function emptyQuote(source: QuoteSource): NormalizedQuote {
  return {
    source,
    hotels: [],
    flights: [],
    cars: [],
    transfers: [],
    activities: [],
    tickets: [],
    insurance: [],
    services: [],
    options: [],
  };
}

export const PRODUCT_KINDS = [
  "hotels",
  "flights",
  "cars",
  "transfers",
  "activities",
  "tickets",
  "insurance",
  "services",
] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export function optionProductKinds(option: NormalizedOption): ProductKind[] {
  return PRODUCT_KINDS.filter((k) => (option[k] as unknown[]).length > 0);
}

export function optionHasProducts(option: NormalizedOption): boolean {
  return optionProductKinds(option).length > 0;
}

export interface QuoteSourceParser {
  supports(url: string): boolean;
  parse(html: string, url: string): NormalizedQuote;
}

