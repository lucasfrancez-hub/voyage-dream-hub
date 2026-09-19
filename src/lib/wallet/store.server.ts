/**
 * Carteira VIA AIR — armazenamento e histórico.
 *
 * A VIA AIR é aqui apenas uma camada financeira genérica:
 *  - Pagamento 1 (entrada): cobrança Pix que o cliente paga à VIA AIR.
 *  - Pagamento 2 (saída):  Pix copia e cola de fornecedor que a VIA AIR quita.
 *
 * Ela não conhece Utravel, hotel, aéreo ou qualquer fornecedor: quem sabe
 * disso é quem consome a API (hoje o Sky Hub). SERVER-ONLY.
 */
import { randomBytes } from "node:crypto";

export type ChargeStatus =
  | "awaiting_customer_payment"
  | "customer_paid"
  | "expired"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "failed";

export type PayoutStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "expired"
  | "manual_review";

export type WalletCharge = {
  id: string;
  api_client_id: string;
  external_reference: string;
  order_ref: string | null;
  booking_ref: string | null;
  service_ref: string | null;
  agency_ref: string | null;
  description: string | null;
  amount: number;
  currency: string;
  status: ChargeStatus;
  payer_name: string | null;
  payer_document: string | null;
  payer_email: string | null;
  asaas_payment_id: string | null;
  asaas_customer_id: string | null;
  qr_code: string | null;
  qr_code_image: string | null;
  invoice_url: string | null;
  callback_url: string | null;
  expires_at: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  refund_status: string | null;
  refunded_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WalletPayout = {
  id: string;
  api_client_id: string;
  charge_id: string | null;
  idempotency_key: string;
  external_reference: string | null;
  order_ref: string | null;
  amount: number;
  currency: string;
  pix_copy_paste: string;
  receiver_name: string | null;
  receiver_document: string | null;
  bank_name: string | null;
  status: PayoutStatus;
  fail_code: string | null;
  fail_reason: string | null;
  asaas_transfer_id: string | null;
  transfer_row_id: string | null;
  expires_at: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Referência pública da cobrança: nunca revela identificadores internos. */
export function novaReferencia(prefixo: "wch" | "wpo"): string {
  return `${prefixo}_${randomBytes(12).toString("hex")}`;
}

export function dinheiro(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

/** Histórico imutável: nunca sobrescreve, nunca guarda token ou segredo. */
export async function registrarEvento(args: {
  chargeId?: string | null;
  payoutId?: string | null;
  type: string;
  status?: string | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
}) {
  try {
    const supabase = await db();
    await supabase.from("wallet_events").insert({
      charge_id: args.chargeId ?? null,
      payout_id: args.payoutId ?? null,
      type: args.type,
      status: args.status ?? null,
      message: args.message ?? null,
      payload: (args.payload ?? null) as never,
    } as never);
  } catch {
    /* auditoria nunca derruba o fluxo */
  }
}

export async function lerCobranca(externalReference: string): Promise<WalletCharge | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("wallet_charges")
    .select("*")
    .eq("external_reference", externalReference)
    .maybeSingle();
  return (data as unknown as WalletCharge) ?? null;
}

export async function lerCobrancaPorAsaas(paymentId: string): Promise<WalletCharge | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("wallet_charges")
    .select("*")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();
  return (data as unknown as WalletCharge) ?? null;
}

export async function atualizarCobranca(id: string, patch: Record<string, unknown>) {
  const supabase = await db();
  await supabase
    .from("wallet_charges")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
}

export async function lerPagamento(id: string): Promise<WalletPayout | null> {
  const supabase = await db();
  const { data } = await supabase.from("wallet_payouts").select("*").eq("id", id).maybeSingle();
  return (data as unknown as WalletPayout) ?? null;
}

export async function atualizarPagamento(id: string, patch: Record<string, unknown>) {
  const supabase = await db();
  await supabase
    .from("wallet_payouts")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
}

/** Situação expirada é derivada: o banco guarda o vencimento, não um relógio. */
export function statusCobranca(c: WalletCharge): ChargeStatus {
  if (c.status === "awaiting_customer_payment" && c.expires_at) {
    if (new Date(c.expires_at).getTime() < Date.now()) return "expired";
  }
  return c.status;
}

/** Contrato entregue a quem consome a API — sem dado interno do provedor. */
export function cobrancaParaApi(c: WalletCharge) {
  return {
    paymentId: c.external_reference,
    status: statusCobranca(c),
    amount: Number(c.amount),
    currency: c.currency,
    description: c.description,
    orderId: c.order_ref,
    bookingId: c.booking_ref,
    serviceId: c.service_ref,
    agencyId: c.agency_ref,
    qrCodeBase64: c.qr_code_image,
    copyPaste: c.qr_code,
    invoiceUrl: c.invoice_url,
    expiresAt: c.expires_at,
    paidAt: c.paid_at,
    paidAmount: c.paid_amount == null ? null : Number(c.paid_amount),
    refundStatus: c.refund_status,
    providerReference: c.external_reference,
    createdAt: c.created_at,
  };
}

export function pagamentoParaApi(p: WalletPayout) {
  return {
    payoutId: p.id,
    status: p.status,
    amount: Number(p.amount),
    currency: p.currency,
    orderId: p.order_ref,
    externalReference: p.external_reference,
    transactionId: p.asaas_transfer_id,
    receiverName: p.receiver_name,
    paidAt: p.paid_at,
    paidAmount: p.paid_amount == null ? null : Number(p.paid_amount),
    code: p.fail_code,
    message: p.fail_reason,
    retryable: p.status === "failed" && p.fail_code !== "insufficient_balance",
    expiresAt: p.expires_at,
    createdAt: p.created_at,
  };
}
