/**
 * Tipos públicos do SDK da API interna VIA AIR (v1).
 * Este arquivo pode ser copiado para a Sky Hub como está.
 */

export type ApiError = {
  code: string;
  message: string;
  provider: string | null;
  retryable: boolean;
  correlationId: string;
  details?: unknown;
};

export type FlightSearchRequest = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  adults?: number;
  children?: number;
  infants?: number;
  cabinClass?: string;
  checkedBaggage?: boolean;
  maxStops?: number;
  airlines?: string[];
};

export type Airline = { iata: string | null; name: string | null };

export type FlightSegment = {
  flightNumber: string;
  airline: Airline;
  origin: string;
  destination: string;
  departureAt: string | null;
  arrivalAt: string | null;
  cabinClass: string | null;
};

export type FareOption = {
  fareKey: string;
  price: number;
  tax: number;
  total: number;
  fareFamily: string | null;
  cabinClass: string | null;
  checkedBaggage: boolean;
};

export type FlightOffer = {
  offerId: string;
  airline: Airline;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string | null;
  arrivalAt: string | null;
  durationMinutes: number | null;
  stops: number;
  price: { amount: number; tax: number; total: number; currency: "BRL"; passengers: number };
  segments: FlightSegment[];
  fares: FareOption[];
};

export type FlightSearchResponse = {
  searchId: string;
  roundTrip: boolean;
  outbound: FlightOffer[];
};

export type InboundResponse = { searchId: string; inbound: FlightOffer[] };

export type Passenger = {
  firstName: string;
  lastName: string;
  passengerType: "ADT" | "CHD" | "INF";
  birthDate?: string | null;
  gender?: "M" | "F" | null;
  documentNumber?: string | null;
  nationality?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type Checkout = {
  checkoutId: string;
  status: string;
  expiresAt: string | null;
  amount: number | null;
  currency: string;
  flights: unknown;
  passengers: unknown[];
};

export type RevalidateResult =
  | { status: "VALID"; amount: number }
  | { status: "PRICE_CHANGED"; previousAmount: number; currentAmount: number; difference: number }
  | { status: "EXPIRED" };

export type PaymentMethod = {
  method: "CARD" | "PIX" | "VIAAIR_ASAAS";
  available: boolean;
  maxCards?: number;
  reason?: string | null;
};

export type InstallmentOption = {
  installments: number;
  installmentAmount: number;
  totalAmount: number;
  interest: boolean;
};

export type CardToken = {
  token: string;
  key: string;
  brand: string | null;
  cardBin: string | null;
  lastDigits: string | null;
};

export type PixPayment = {
  paymentId: string;
  txid: string;
  amount: number;
  qrCode: string;
  qrCodeImage: string | null;
  invoiceUrl: string | null;
  expiresAt: string;
  status: PaymentStatus;
};

export type PaymentStatus = "ACTIVE" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";

export type OrderStatus =
  | "CREATED"
  | "AWAITING_PAYMENT"
  | "CUSTOMER_PAYMENT_PAID"
  | "SUPPLIER_PAYMENT_PENDING"
  | "SUPPLIER_PAYMENT_PAID"
  | "SUPPLIER_PAYMENT_REVIEW"
  | "WAITING_RESERVATION"
  | "LOCATOR_RECEIVED"
  | "TICKETS_RECEIVED"
  | "COMPLETE"
  | "PRICE_CHANGED"
  | "MANUAL_REVIEW"
  | "FAILED"
  | "CANCELLED";

export type Ticket = {
  passenger: string | null;
  ticketNumber: string | null;
  pnr: string | null;
  airline: string | null;
  status: string | null;
};

export type Order = {
  orderId: string;
  viaairOrderId: string | null;
  providerOrderNumber: string | null;
  saleId: string | null;
  status: OrderStatus;
  amount: number | null;
  currency: string;
  paymentMethod: string | null;
  customerPaymentStatus: string | null;
  supplierPaymentStatus: string | null;
  locator: string | null;
  passengers: unknown[];
  tickets: Ticket[];
  createdAt: string;
  updatedAt: string;
};

export type WebhookEvent = {
  id: string;
  event: string;
  createdAt: string;
  data: Record<string, unknown>;
};
