/**
 * SDK TypeScript da API interna VIA AIR (v1).
 * Sem dependências: usa apenas fetch. Pode ser copiado para a Sky Hub.
 *
 *   const api = new ViaAirApi({ baseUrl: process.env.VIAAIR_API_BASE_URL!, token: process.env.VIAAIR_API_TOKEN! });
 *   const busca = await api.searchFlights({ origin: "GRU", destination: "GIG", departureDate: "2026-10-12" });
 */
import type {
  ApiError,
  CardToken,
  Checkout,
  FlightSearchRequest,
  FlightSearchResponse,
  InboundResponse,
  InstallmentOption,
  Order,
  OrderStatus,
  Passenger,
  PaymentMethod,
  PixPayment,
  RevalidateResult,
  Ticket,
} from "./types";

export * from "./types";

export class ViaAirApiError extends Error {
  readonly error: ApiError;
  readonly status: number;
  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ViaAirApiError";
    this.status = status;
    this.error = error;
  }
}

export type ViaAirApiOptions = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class ViaAirApi {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly f: typeof fetch;

  constructor(opts: ViaAirApiOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.f = opts.fetchImpl ?? fetch;
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    extra?: { idempotencyKey?: string; correlationId?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (extra?.idempotencyKey) headers["idempotency-key"] = extra.idempotencyKey;
    if (extra?.correlationId) headers["x-correlation-id"] = extra.correlationId;

    const res = await this.f(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const texto = await res.text();
    const json = texto ? (JSON.parse(texto) as unknown) : null;
    if (!res.ok) {
      const e = (json as { error?: ApiError } | null)?.error;
      throw new ViaAirApiError(res.status, {
        code: e?.code ?? "internal_error",
        message: e?.message ?? `Erro ${res.status}`,
        provider: e?.provider ?? null,
        retryable: e?.retryable ?? res.status >= 500,
        correlationId: e?.correlationId ?? res.headers.get("x-correlation-id") ?? "",
      });
    }
    return json as T;
  }

  health() {
    return this.call<{ status: string; version: string; services: Record<string, string> }>(
      "GET",
      "/health",
    );
  }

  onerStatus() {
    return this.call<{ available: boolean; session: string; lastValidatedAt: string | null }>(
      "GET",
      "/oner/status",
    );
  }

  searchAirports(query: string, isDeparture = true) {
    const q = new URLSearchParams({ query, isDeparture: String(isDeparture) });
    return this.call<{ airports: Array<{ iata: string; name: string; city: string }> }>(
      "GET",
      `/airports/search?${q}`,
    );
  }

  searchFlights(input: FlightSearchRequest) {
    return this.call<FlightSearchResponse>("POST", "/flights/search", input);
  }

  getInboundFlights(input: { searchId: string; outboundOfferId: string }) {
    return this.call<InboundResponse>("POST", "/flights/inbound", input);
  }

  createCheckout(
    input: { offerId: string; inboundOfferId?: string; fareKey?: string },
    idempotencyKey?: string,
  ) {
    return this.call<{ checkoutId: string; status: string; expiresAt: string }>(
      "POST",
      "/checkouts",
      input,
      { idempotencyKey },
    );
  }

  getCheckout(checkoutId: string) {
    return this.call<Checkout>("GET", `/checkouts/${checkoutId}`);
  }

  setPassengers(checkoutId: string, passengers: Passenger[], idempotencyKey?: string) {
    return this.call<{ ok: true; passengers: number }>(
      "PUT",
      `/checkouts/${checkoutId}/passengers`,
      { passengers },
      { idempotencyKey },
    );
  }

  revalidate(checkoutId: string) {
    return this.call<RevalidateResult>("POST", `/checkouts/${checkoutId}/revalidate`);
  }

  getPaymentMethods(checkoutId: string) {
    return this.call<{ methods: PaymentMethod[] }>("GET", `/checkouts/${checkoutId}/payment-methods`);
  }

  getInstallments(checkoutId: string, input: { cardBin: string; amount: number }) {
    return this.call<{ installments: InstallmentOption[] }>(
      "POST",
      `/checkouts/${checkoutId}/installments`,
      input,
    );
  }

  createCardToken(
    checkoutId: string,
    input: { number: string; holder: string; expMonth: string; expYear: string; cvv: string },
  ) {
    return this.call<CardToken>("POST", `/checkouts/${checkoutId}/payments/card-token`, input);
  }

  payByCard(
    checkoutId: string,
    input: {
      cards: Array<{ token: string; key: string; amount: number; installments: number }>;
      payer: Record<string, unknown>;
    },
    idempotencyKey?: string,
  ) {
    return this.call<{ status: string; orderId: string | null; locator: string | null }>(
      "POST",
      `/checkouts/${checkoutId}/payments/card`,
      input,
      { idempotencyKey },
    );
  }

  createPix(
    checkoutId: string,
    input: { payer: { name: string; document: string; email?: string; phone?: string } },
    idempotencyKey?: string,
  ) {
    return this.call<PixPayment>("POST", `/checkouts/${checkoutId}/payments/pix`, input, {
      idempotencyKey,
    });
  }

  getCheckoutPix(checkoutId: string) {
    return this.call<PixPayment>("GET", `/checkouts/${checkoutId}/payments/pix`);
  }

  getPayment(paymentId: string) {
    return this.call<PixPayment>("GET", `/payments/${paymentId}`);
  }

  cancelPayment(checkoutId: string) {
    return this.call<{ ok: boolean }>("POST", `/checkouts/${checkoutId}/payments/cancel`);
  }

  createOrder(checkoutId: string, idempotencyKey?: string) {
    return this.call<{ orderId: string; providerOrderNumber: string | null }>(
      "POST",
      `/checkouts/${checkoutId}/order`,
      {},
      { idempotencyKey },
    );
  }

  getOrder(orderId: string) {
    return this.call<Order>("GET", `/orders/${orderId}`);
  }

  getOrderStatus(orderId: string) {
    return this.call<{ orderId: string; status: OrderStatus; detail: string | null }>(
      "GET",
      `/orders/${orderId}/status`,
    );
  }

  getTickets(orderId: string) {
    return this.call<{ orderId: string; tickets: Ticket[] }>("GET", `/orders/${orderId}/tickets`);
  }

  getDocuments(orderId: string) {
    return this.call<{ orderId: string; documents: Array<{ name: string; url: string | null }> }>(
      "GET",
      `/orders/${orderId}/documents`,
    );
  }
}

/** Confere a assinatura de um aviso enviado pela VIA AIR (Node/Web Crypto). */
export async function verificarAssinaturaWebhook(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
}): Promise<boolean> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", chave, enc.encode(`${input.timestamp}.${input.rawBody}`));
  const hex = Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const esperado = `sha256=${hex}`;
  if (esperado.length !== input.signature.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ input.signature.charCodeAt(i);
  return diff === 0;
}
