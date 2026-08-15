/**
 * IMPORTANTE:
 *
 * AIR_ONLY é o formato oficial de apresentação das cotações aéreas
 * realizadas pelos agentes Bruno e Paula.
 *
 * Bruno e Paula NÃO devem mais enviar os antigos cards/imagens de
 * resultados de voos.
 *
 * Após a seleção das opções:
 *
 * flight search
 * -> AIR_ONLY quote
 * -> public URL
 * -> Via Air short URL
 * -> WhatsApp text + short URL
 *
 * A alteração é de APRESENTAÇÃO. Não remover as regras atuais de
 * pesquisa, filtros, seleção de opções ou memória da conversa.
 *
 * Este módulo é o DTO PÚBLICO do orçamento: nada de comissão, markup,
 * custo, fornecedor interno, margem ou observações internas.
 */

export type QuoteType = "AIR_ONLY" | "TRIP_PACKAGE";

export type PassengerSummary = {
  adults: number;
  children: number;
  infants: number;
  label: string; // "2 adultos"
};

export type FlightSegment = {
  airline: string;
  airlineIata?: string | null;
  flightNumber?: string | null;
  fromIata: string;
  fromName?: string | null;
  fromTerminal?: string | null;
  toIata: string;
  toName?: string | null;
  toTerminal?: string | null;
  departure: string; // "2026-09-10 06:10"
  arrival: string;
  duration?: string | null;
  aircraft?: string | null;
  connectionAfter?: string | null; // "conexão 1h10"
  /** Aviso de troca de aeroporto na conexão seguinte (mesma cidade). */
  airportChange?: string | null;
};

export type FlightLeg = {
  direction: "OUTBOUND" | "INBOUND";
  label: string; // "Voo de ida"
  airline: string;
  airlineIata?: string | null;
  dateLabel: string; // "quinta, 10 de setembro"
  departureTime: string; // "06:10"
  arrivalTime: string;
  fromIata: string;
  fromCity?: string | null;
  toIata: string;
  toCity?: string | null;
  duration?: string | null;
  stops: number;
  stopsLabel: string; // "Direto" | "1 conexão"
  cabin?: string | null;
  fareFamily?: string | null;
  carryOn: boolean;
  personalItem: boolean;
  checkedBaggage: boolean;
  /** Ex.: "1x bagagem despachada (23kg)" */
  checkedBaggageLabel?: string | null;
  segments: FlightSegment[];
  /** Trecho possui conexão com troca de aeroporto. */
  hasAirportChange?: boolean;
  rules?: string[];
};

export type FlightProduct = {
  id: string;
  optionId: string;
  legs: FlightLeg[];
};

export type HotelNearbyPlace = { name: string; distance: string };

export type HotelLocation = {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  nearbyPlaces: HotelNearbyPlace[];
};

export type HotelProduct = {
  id: string;
  name: string;
  stars: number | null;
  place?: string | null;
  photos: string[];
  checkIn: string | null; // "10/09 • 13:00"
  checkOut: string | null;
  occupancy: string | null;
  mealPlan: string | null;
  benefits: string[];
  roomName: string | null;
  roomDescription: string | null;
  /** Texto "sobre o hotel" (traduzido) exibido em modal, nunca inline. */
  about?: string | null;
  /** Nota do TripAdvisor (0-5) e quantidade de avaliações. */
  rating?: number | null;
  reviewsCount?: number | null;
  location: HotelLocation | null;
  mapsUrl: string | null;
};

export type SimpleProduct = {
  id: string;
  title: string;
  summary: string | null;
  photo?: string | null;
  details: Array<{ label: string; value: string }>;
  description?: string | null;
  included?: string[];
  rules?: string[];
};

export type QuoteProducts = {
  flights?: FlightProduct[];
  hotels?: HotelProduct[];
  cars?: SimpleProduct[];
  transfers?: SimpleProduct[];
  activities?: SimpleProduct[];
  tickets?: SimpleProduct[];
  insurance?: SimpleProduct[];
  services?: SimpleProduct[];
};

export type Installment = {
  number: number;
  amount: number;
  total: number;
  interestFree: boolean;
};

export type PaymentConfiguration = {
  methods: Array<"CARD" | "BOLETO" | "PIX">;
  card: {
    enabled: boolean;
    brands: string[];
    installments: Installment[];
  };
  boleto: {
    enabled: boolean;
    installments: Installment[];
    note?: string | null;
  };
  pix: {
    enabled: boolean;
    discountPercent: number;
    total: number;
  };
};

export type QuoteSummaryLine = {
  icon:
    | "hotel"
    | "flight"
    | "car"
    | "transfer"
    | "activity"
    | "ticket"
    | "insurance"
    | "service"
    | "tax";
  label: string;
  value: string;
};

export type QuoteAgent = {
  name: string;
  photoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
};

export type QuoteOption = {
  optionId: string;
  label: string;
  products: QuoteProducts;
  totals: QuoteTotals;
  payment: PaymentConfiguration;
  summary?: QuoteSummaryLine[];
};

export type QuoteTotals = {
  products: number;
  taxes: number;
  total: number;
  pixTotal?: number;
};

export type PublicQuote = {
  id: string;
  publicId: string;
  shortUrl?: string | null;
  type: QuoteType;
  title: string;
  subtitle?: string | null;
  origin?: string | null;
  destination?: string | null;
  startDate: string | null;
  endDate?: string | null;
  nights?: number | null;
  tripKind?: string | null; // "Ida e volta"
  cabin?: string | null;
  passengers: PassengerSummary;
  products: QuoteProducts;
  options?: QuoteOption[];
  payment: PaymentConfiguration;
  totals: QuoteTotals;
  summary: QuoteSummaryLine[];
  agent?: QuoteAgent | null;
  source?: {
    type: "MANUAL" | "BRUNO" | "PAULA" | "SYSTEM";
    conversationId?: string | null;
  };
  validUntil?: string | null;
  expired?: boolean;
  publicNotes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const BRAND = {
  navy: "#0d2b45",
  blue: "#145d9c",
  orange: "#f39a36",
  green: "#168754",
} as const;

export function hasProducts(p: QuoteProducts | undefined): boolean {
  if (!p) return false;
  return Object.values(p).some((v) => Array.isArray(v) && v.length > 0);
}
