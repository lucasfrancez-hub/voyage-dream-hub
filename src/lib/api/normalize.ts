/**
 * Tradução dos formatos internos (Oner / integração) para o formato
 * estável da API interna VIA AIR. Client-safe.
 */
import type { OnerFlight, OnerPlace } from "@/lib/onertravel.types";
import type { OnerState } from "@/lib/integrations/oner/config";
import {
  montarPlanoDeParcelamento,
  type ApiInstallmentPlan,
} from "@/lib/api/installment-plan";
import type { MarkupTable } from "@/lib/airfare-conditions";

export type ApiSegment = {
  flightNumber: string;
  airline: { iata: string | null; name: string | null };
  origin: string;
  destination: string;
  departureAt: string | null;
  arrivalAt: string | null;
  cabinClass: string | null;
};

export type ApiFare = {
  fareKey: string;
  price: number;
  tax: number;
  total: number;
  fareFamily: string | null;
  cabinClass: string | null;
  checkedBaggage: boolean;
};

export type ApiFlightOffer = {
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
  segments: ApiSegment[];
  fares: ApiFare[];
  /** Simulação comercial VIA AIR (sem juros da cia + markup acima do teto). */
  installmentPlan?: ApiInstallmentPlan | null;
};

function iso(p?: OnerPlace | null): string | null {
  if (!p?.date?.year) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.date.year}-${pad(p.date.month)}-${pad(p.date.day)}T${pad(p.time?.hour ?? 0)}:${pad(
    p.time?.minute ?? 0,
  )}:00`;
}

function temBagagem(f: OnerFlight): boolean {
  if (f.journey.allowedBaggage) return true;
  return (f.journey.baggagesAllowance ?? []).some((b) => {
    const d = `${b.typeDescription ?? ""}`.toLowerCase();
    return (d.includes("despach") || d.includes("dispatch") || d.includes("checked")) && (b.quantity ?? 0) > 0;
  });
}

export function normalizarVoo(
  f: OnerFlight,
  offerId: string,
  markups?: MarkupTable,
): ApiFlightOffer {
  const j = f.journey;
  const duracao = j.flyingTime ? j.flyingTime.hour * 60 + j.flyingTime.minute : null;
  return {
    offerId,
    airline: { iata: j.marketingAirline?.iata ?? null, name: j.marketingAirline?.name ?? null },
    flightNumber: j.segments?.[0]?.flightNumber ?? "",
    origin: j.departure?.iata ?? "",
    destination: j.destination?.iata ?? "",
    departureAt: iso(j.departure),
    arrivalAt: iso(j.destination),
    durationMinutes: duracao,
    stops: j.numberOfStops ?? Math.max(0, (j.segments?.length ?? 1) - 1),
    price: {
      amount: f.price?.price ?? 0,
      tax: f.price?.tax ?? 0,
      total: f.price?.total ?? 0,
      currency: "BRL",
      passengers: f.price?.passengerCount ?? 1,
    },
    segments: (j.segments ?? []).map((s) => ({
      flightNumber: s.flightNumber,
      airline: { iata: s.marketingAirline?.iata ?? null, name: s.marketingAirline?.name ?? null },
      origin: s.departure?.iata ?? "",
      destination: s.destination?.iata ?? "",
      departureAt: iso(s.departure),
      arrivalAt: iso(s.destination),
      cabinClass: s.cabinClass ?? null,
    })),
    fares: (f.fareOptions ?? []).map((o) => ({
      fareKey: o.key,
      price: o.price,
      tax: o.tax,
      total: o.total,
      fareFamily: o.fareFamily ?? null,
      cabinClass: o.cabinClass ?? null,
      checkedBaggage: Boolean(o.allowedBaggage),
    })),
    installmentPlan: montarPlanoDeParcelamento({
      total: f.price?.total ?? 0,
      airline: j.marketingAirline?.name ?? j.marketingAirline?.iata ?? null,
      markups,
    }),
  };
}

/** Bagagem despachada declarada no voo (nível itinerário). */
export function ofertaTemBagagem(f: OnerFlight): boolean {
  return temBagagem(f);
}

/* ------------------------------------------------------------------ */
/* Situação do pedido                                                   */
/* ------------------------------------------------------------------ */

export type ApiOrderStatus =
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

const MAPA: Partial<Record<OnerState, ApiOrderStatus>> = {
  CART_CREATED: "CREATED",
  PASSENGERS_PENDING: "CREATED",
  PASSENGERS_COMPLETED: "CREATED",
  ONER_CART_CREATED: "CREATED",
  ONER_ORDER_CREATED: "AWAITING_PAYMENT",
  CUSTOMER_PAYMENT_PENDING: "AWAITING_PAYMENT",
  PIX_MANUAL_PREPARATION: "AWAITING_PAYMENT",
  CUSTOMER_PAID: "CUSTOMER_PAYMENT_PAID",
  PAYMENT_RECEIVED: "CUSTOMER_PAYMENT_PAID",
  ONER_MANUAL_PREPARATION: "SUPPLIER_PAYMENT_PENDING",
  ONER_CART_READY: "SUPPLIER_PAYMENT_PENDING",
  ONER_COMMISSION_ZEROED: "SUPPLIER_PAYMENT_PENDING",
  ONER_PIX_READY: "SUPPLIER_PAYMENT_PENDING",
  ONER_PIX_CREATING: "SUPPLIER_PAYMENT_PENDING",
  ONER_PIX_CREATED: "SUPPLIER_PAYMENT_PENDING",
  PROVIDER_PAYMENT_AUTHORIZATION_REQUIRED: "SUPPLIER_PAYMENT_REVIEW",
  PROVIDER_PAYMENT_PROCESSING: "SUPPLIER_PAYMENT_PENDING",
  ONER_PAYMENT_PROCESSING: "SUPPLIER_PAYMENT_PENDING",
  PROVIDER_PAID: "SUPPLIER_PAYMENT_PAID",
  ONER_PAID: "SUPPLIER_PAYMENT_PAID",
  ONER_ORDER_FOUND: "WAITING_RESERVATION",
  ONER_ORDER_CONFIRMING: "WAITING_RESERVATION",
  ONER_SALE_WAITING: "WAITING_RESERVATION",
  ONER_SALE_FOUND: "WAITING_RESERVATION",
  ONER_SALE_DETAIL_SYNCING: "WAITING_RESERVATION",
  WAITING_RESERVATION_DETAILS: "WAITING_RESERVATION",
  LOCATOR_RECEIVED: "LOCATOR_RECEIVED",
  BOOKING_CONFIRMED: "LOCATOR_RECEIVED",
  TICKETS_RECEIVED: "TICKETS_RECEIVED",
  COMPLETE: "COMPLETE",
  PRICE_CHANGED: "PRICE_CHANGED",
  MANUAL_REVIEW: "MANUAL_REVIEW",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
};

export function statusDoPedido(state: OnerState | string | null): ApiOrderStatus {
  return MAPA[(state ?? "") as OnerState] ?? "CREATED";
}

/** Situação normalizada de um pagamento Pix do cliente. */
export type ApiPaymentStatus = "ACTIVE" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";

export function statusDoPagamento(bruto: string | null, expiraEm?: string | null): ApiPaymentStatus {
  const v = (bruto ?? "").toUpperCase();
  if (["PAID", "RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "CONCLUIDA", "PAGA"].includes(v)) return "PAID";
  if (v.startsWith("ESTORN")) return "REFUNDED";
  if (v.startsWith("CANCELAD")) return "CANCELLED";
  if (v.startsWith("EXPIRAD")) return "EXPIRED";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK"].some((x) => v.includes(x))) return "REFUNDED";
  if (["CANCELLED", "CANCELED", "DELETED"].some((x) => v.includes(x))) return "CANCELLED";
  if (expiraEm && new Date(expiraEm).getTime() < Date.now()) return "EXPIRED";
  return "ACTIVE";
}
