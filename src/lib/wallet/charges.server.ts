/**
 * Pagamento 1 — cliente paga a VIA AIR.
 * Cobrança Pix própria (Asaas), desacoplada de pedido de voo ou pacote:
 * serve para qualquer produto que o consumidor da API esteja vendendo.
 * SERVER-ONLY.
 */
import {
  atualizarCobranca,
  cobrancaParaApi,
  db,
  dinheiro,
  lerCobranca,
  novaReferencia,
  registrarEvento,
  type WalletCharge,
} from "./store.server";

export type CriarCobrancaInput = {
  apiClientId: string;
  amount: number;
  description?: string | null;
  orderId?: string | null;
  bookingId?: string | null;
  serviceId?: string | null;
  agencyId?: string | null;
  callbackUrl?: string | null;
  expiresInMinutes?: number | null;
  payer: { name: string; documentNumber: string; email?: string | null };
  metadata?: Record<string, unknown> | null;
};

/**
 * Reaproveita a cobrança ainda válida da mesma origem em vez de gerar
 * dois Pix ativos para o mesmo pedido/reserva/serviço.
 */
async function cobrancaAtivaEquivalente(input: CriarCobrancaInput): Promise<WalletCharge | null> {
  if (!input.orderId && !input.bookingId) return null;
  const supabase = await db();
  let q = supabase
    .from("wallet_charges")
    .select("*")
    .eq("api_client_id", input.apiClientId)
    .eq("status", "awaiting_customer_payment")
    .eq("amount", dinheiro(input.amount))
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  q = input.orderId ? q.eq("order_ref", input.orderId) : q.eq("booking_ref", input.bookingId!);
  const { data } = await q.maybeSingle();
  return (data as unknown as WalletCharge) ?? null;
}

export async function criarCobranca(input: CriarCobrancaInput) {
  const valor = dinheiro(input.amount);
  if (!(valor > 0)) throw new Error("Valor da cobrança inválido.");

  const reaproveitada = await cobrancaAtivaEquivalente(input);
  if (reaproveitada) {
    return { charge: cobrancaParaApi(reaproveitada), reused: true as const };
  }

  const minutos = Math.min(Math.max(input.expiresInMinutes ?? 30, 5), 1440);
  const referencia = novaReferencia("wch");

  const { ensureAsaasCustomer, createAsaasPixPayment } = await import("@/lib/asaas.server");
  const customerId = await ensureAsaasCustomer({
    name: input.payer.name,
    cpfCnpj: input.payer.documentNumber.replace(/\D/g, ""),
    email: input.payer.email ?? undefined,
    externalReference: referencia,
  });

  const pix = await createAsaasPixPayment({
    customerId,
    value: valor,
    description: input.description ?? "Pagamento VIA AIR",
    externalReference: referencia,
    expiresInMinutes: minutos,
  });

  const supabase = await db();
  const { data, error } = await supabase
    .from("wallet_charges")
    .insert({
      api_client_id: input.apiClientId,
      external_reference: referencia,
      order_ref: input.orderId ?? null,
      booking_ref: input.bookingId ?? null,
      service_ref: input.serviceId ?? null,
      agency_ref: input.agencyId ?? null,
      description: input.description ?? null,
      amount: valor,
      currency: "BRL",
      status: "awaiting_customer_payment",
      payer_name: input.payer.name,
      payer_document: input.payer.documentNumber.replace(/\D/g, ""),
      payer_email: input.payer.email ?? null,
      asaas_payment_id: pix.paymentId,
      asaas_customer_id: customerId,
      qr_code: pix.payload,
      qr_code_image: pix.encodedImage ? `data:image/png;base64,${pix.encodedImage}` : null,
      invoice_url: pix.invoiceUrl,
      callback_url: input.callbackUrl ?? null,
      expires_at: pix.expiresAt,
      metadata: (input.metadata ?? {}) as never,
    } as never)
    .select("*")
    .single();

  if (error || !data) throw new Error(`Não foi possível registrar a cobrança: ${error?.message}`);
  const charge = data as unknown as WalletCharge;

  await registrarEvento({
    chargeId: charge.id,
    type: "charge.created",
    status: charge.status,
    message: "Cobrança Pix VIA AIR criada",
    payload: { amount: valor, expiresAt: charge.expires_at },
  });

  try {
    const { enfileirarEvento } = await import("@/lib/api/webhooks.server");
    await enfileirarEvento("wallet.charge.created", {
      paymentId: charge.external_reference,
      orderId: charge.order_ref,
      bookingId: charge.booking_ref,
      serviceId: charge.service_ref,
      amount: valor,
      expiresAt: charge.expires_at,
    });
  } catch {
    /* aviso nunca interrompe */
  }

  return { charge: cobrancaParaApi(charge), reused: false as const };
}

/**
 * Chamado pelo webhook do gateway quando o Pix do cliente é confirmado.
 * Idempotente: a segunda chamada não reprocessa nem reavisa.
 */
export async function confirmarPagamentoCliente(args: {
  charge: WalletCharge;
  paidAt: string;
  paidAmount: number;
  raw?: Record<string, unknown> | null;
}) {
  if (args.charge.status === "customer_paid") {
    return { ok: true as const, duplicate: true as const };
  }

  await atualizarCobranca(args.charge.id, {
    status: "customer_paid",
    paid_at: args.paidAt,
    paid_amount: dinheiro(args.paidAmount),
  });

  await registrarEvento({
    chargeId: args.charge.id,
    type: "charge.customer_paid",
    status: "customer_paid",
    message: "Pix do cliente confirmado pelo gateway",
    payload: { amount: dinheiro(args.paidAmount), paidAt: args.paidAt },
  });

  try {
    const { enfileirarEvento } = await import("@/lib/api/webhooks.server");
    await enfileirarEvento("wallet.customer_payment_confirmed", {
      paymentId: args.charge.external_reference,
      orderId: args.charge.order_ref,
      bookingId: args.charge.booking_ref,
      serviceId: args.charge.service_ref,
      amount: dinheiro(args.paidAmount),
      paidAt: args.paidAt,
    });
  } catch {
    /* aviso nunca interrompe */
  }

  return { ok: true as const, duplicate: false as const };
}

/** Cancelamento/vencimento/estorno vindos do gateway. */
export async function encerrarCobranca(args: {
  charge: WalletCharge;
  status: "expired" | "cancelled" | "refunded";
  motivo: string;
}) {
  await atualizarCobranca(args.charge.id, {
    status: args.status,
    ...(args.status === "refunded"
      ? { refund_status: "refunded", refunded_at: new Date().toISOString() }
      : {}),
  });
  await registrarEvento({
    chargeId: args.charge.id,
    type: `charge.${args.status}`,
    status: args.status,
    message: args.motivo,
  });
  try {
    const { enfileirarEvento } = await import("@/lib/api/webhooks.server");
    await enfileirarEvento(
      args.status === "refunded" ? "wallet.refund.completed" : "wallet.charge.expired",
      {
        paymentId: args.charge.external_reference,
        orderId: args.charge.order_ref,
        bookingId: args.charge.booking_ref,
        status: args.status,
      },
    );
  } catch {
    /* aviso nunca interrompe */
  }
}

/** Abre a devolução ao cliente. A execução é conferida por pessoa. */
export async function abrirReembolso(args: { referencia: string; motivo: string }) {
  const charge = await lerCobranca(args.referencia);
  if (!charge) return { ok: false as const, motivo: "not_found" as const };
  if (charge.status !== "customer_paid" && charge.refund_status !== "refund_pending") {
    return { ok: false as const, motivo: "not_paid" as const };
  }
  await atualizarCobranca(charge.id, { status: "refund_pending", refund_status: "refund_pending" });
  await registrarEvento({
    chargeId: charge.id,
    type: "charge.refund_pending",
    status: "refund_pending",
    message: args.motivo,
  });
  try {
    const { enfileirarEvento } = await import("@/lib/api/webhooks.server");
    await enfileirarEvento("wallet.refund.pending", {
      paymentId: charge.external_reference,
      orderId: charge.order_ref,
      bookingId: charge.booking_ref,
      amount: Number(charge.paid_amount ?? charge.amount),
      reason: args.motivo,
    });
  } catch {
    /* aviso nunca interrompe */
  }
  const atualizado = await lerCobranca(args.referencia);
  return { ok: true as const, charge: cobrancaParaApi(atualizado ?? charge) };
}
