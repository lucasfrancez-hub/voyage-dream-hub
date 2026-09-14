/**
 * Tipos da API interna VIA AIR (v1).
 * Espelham exatamente o contrato publicado em docs/openapi.yaml.
 * Escopo da v1: aéreo (busca, checkout, pagamento, pedidos). Hotéis, carros,
 * seguro, produtos e pacotes ainda NÃO estão expostos.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "provider_error"
  | "provider_unavailable"
  | "price_changed"
  | "payment_declined"
  | "internal_error";

/** Conteúdo do campo `error` devolvido pela API. */
export type ApiError = {
  code: ApiErrorCode;
  message: string;
  provider: string | null;
  retryable: boolean;
  correlationId: string;
  details?: unknown;
};

/** Corpo completo de uma resposta de erro. */
export type ApiErrorResponse = { error: ApiError };


/* ------------------------------ Saúde ------------------------------ */

export type HealthResponse = {
  status: "ok" | "degraded";
  version: string;
  time: string;
  services: { oner: "up" | "degraded" | "down" | "unknown"; asaas: "configured" | "not_configured" };
};

export type OnerStatusResponse = {
  available: boolean;
  session: "active" | "inactive";
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  message: string | null;
};

/* ------------------------------ Voos ------------------------------- */

export type Airport = {
  iata?: string;
  name?: string;
  city?: string;
  country?: string;
  isCity?: boolean;
};

export type FlightSearchRequest = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  adults?: number;
  children?: number;
  infants?: number;
  cabinClass?: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST" | null;
  checkedBaggage?: boolean;
  maxStops?: number | null;
  airlines?: string[];
  originIsCity?: boolean;
  destinationIsCity?: boolean;
};

export type FlightSegment = {
  flightNumber: string;
  airline: { iata: string | null; name: string | null };
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
  airline: { iata: string | null; name: string | null };
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
  currency: "BRL";
  totalCount: number;
  outbound: FlightOffer[];
};

export type InboundResponse = {
  searchId: string;
  outboundOfferId: string;
  totalCount: number;
  inbound: FlightOffer[];
};

/* ----------------------------- Checkout ---------------------------- */

export type CreateCheckoutRequest = { offerId: string; inboundOfferId?: string | null };

export type CreateCheckoutResponse = {
  checkoutId: string;
  status: "CREATED";
  roundTrip: boolean;
  createdAt: string;
};

export type Checkout = {
  checkoutId: string;
  status: "ACTIVE" | "EXPIRED";
  currency: string;
  amount: { fare: number; taxes: number; total: number };
  passengersCount: { adults: number; children: number; infants: number };
  flights: unknown;
  prices: unknown;
  installments: unknown;
  passengers: unknown;
  passengersSaved: boolean;
};

export type Passenger = {
  firstName: string;
  lastName: string;
  /** ADT (adulto), CHD (criança) ou INF (bebê). Padrão: ADT. */
  type?: "ADT" | "CHD" | "INF";
  gender: "M" | "F";
  birthDate: string;
  documentNumber: string;
  /** 1 = CPF (padrão). */
  documentType?: number;
  /** 30 = Brasil (padrão). */
  nationalityCountryId?: number;
  /** Somente o primeiro passageiro. */
  email?: string | null;
  /** Somente o primeiro passageiro. */
  phone?: string | null;
};

export type PassengersResponse = { checkoutId: string; passengersSaved: number };

export type RevalidateResult =
  | { status: "VALID"; amount: number }
  | { status: "PRICE_CHANGED"; previousAmount: number; currentAmount: number; difference: number }
  | { status: "EXPIRED"; previousAmount: number; currentAmount: null };

/* ---------------------------- Pagamentos --------------------------- */

export type PaymentMethod =
  | { method: "CARD"; maxCards: number; holderDocumentRequired: boolean }
  | { method: "PIX"; provider: "VIAAIR_ASAAS" };

export type PaymentMethodsResponse = {
  checkoutId: string;
  methods: PaymentMethod[];
  pixOnly: boolean;
  pixOnlyReason: string | null;
};

/** Opção de parcelamento tal como informada pela operadora. */
export type InstallmentOption = {
  installment: number;
  installmentsValue: number;
  total: number;
  interestRate: number;
  hasRate: boolean;
  firstInstallmentAddition: number;
  split: boolean;
};

export type CardTokenRequest = {
  holderName: string;
  number: string;
  cvv: string;
  expirationMonth: string;
  expirationYear: string;
  /** 1 = CPF (padrão). */
  documentType?: number;
  documentNumber: string;
};

export type CardToken = {
  cardToken: string;
  cardKey: string;
  brand: string;
  cardBin: string;
  lastDigits: string;
};

export type CardPayment = {
  cardToken: string;
  cardKey: string;
  brand: string;
  cardBin: string;
  lastDigits: string;
  holderName: string;
  documentType?: number;
  documentNumber: string;
  expirationMonth: number;
  expirationYear: number;
  amount: number;
  installments: number;
  interestRate?: number;
};

export type Payer = {
  firstName: string;
  lastName: string;
  documentNumber: string;
  birthDate: string;
  email: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
};

export type CardPaymentRequest = {
  cards: CardPayment[];
  totalAmount: number;
  payer: Payer;
};

export type CardPaymentResponse = {
  status: "PAID";
  method: "CARD";
  amount: number;
  locator: string;
  orderId: string | null;
};

export type PixPayer = { name: string; email?: string; documentNumber: string };

export type PixRequest = { amount: number; payer: PixPayer };

export type PaymentStatus = "ACTIVE" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";

export type PixPayment = {
  paymentId: string;
  txid: string;
  orderId: string | null;
  amount: number | null;
  currency: "BRL";
  qrCode: string | null;
  /** Data URI pronta para <img src>: `data:image/png;base64,…`. */
  qrCodeImage: string | null;
  invoiceUrl: string | null;
  expiresAt: string | null;
  status: PaymentStatus;
  provider: "VIAAIR_ASAAS";
  createdAt?: string;
};

export type CancelPaymentResponse = {
  checkoutId: string;
  status: "CANCELLED";
  ticketsAffected: boolean;
};

/* ------------------------------ Pedidos ---------------------------- */

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

export type CreateOrderResponse = {
  orderId: string;
  providerOrderNumber: string | null;
  status: "CREATED";
};

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
  rawState: string | null;
  amount: number | null;
  currency: string;
  paymentMethod: string | null;
  customerPaymentStatus: string | null;
  supplierPaymentStatus: string | null;
  locator: string | null;
  passengers: unknown[];
  tickets: Ticket[];
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderStatusResponse = {
  orderId: string;
  status: OrderStatus;
  detail: string | null;
  customerPaymentStatus: string | null;
  supplierPaymentStatus: string | null;
  locator: string | null;
  providerOrderNumber: string | null;
  updatedAt: string;
};

export type TicketsResponse = { orderId: string; tickets: Ticket[] };

export type OrderDocument = {
  name: string;
  url: string | null;
  createdAt: string | null;
  expiresInSeconds: number;
};

export type DocumentsResponse = { orderId: string; documents: OrderDocument[] };

/* ------------------------------ Avisos ----------------------------- */

export type WebhookEventName =
  | "checkout.updated"
  | "customer.payment.paid"
  | "customer.payment.failed"
  | "supplier.payment.pending"
  | "supplier.payment.paid"
  | "supplier.payment.failed"
  | "order.created"
  | "order.locator.received"
  | "order.ticket.received"
  | "order.completed"
  | "order.failed";

export type WebhookEvent = {
  id: string;
  event: WebhookEventName;
  createdAt: string;
  data: Record<string, unknown>;
};
