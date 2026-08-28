import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  consultarPagamentoInfinitePay,
  criarCheckoutInfinitePay,
  gerarOrderNsu,
  PASSAPORTE_MAX_PARCELAS_CARTAO,
  PASSAPORTE_VALOR_CENTAVOS,
} from "./infinitepay.server";

import type { PassportPaymentRow, ConfirmacaoResultado } from "./passaporte-pagamento.types";
export type { PassportPaymentRow, ConfirmacaoResultado };

export function mapPassportPayment(row: Record<string, any>): PassportPaymentRow {
  return {
    id: row.id,
    passportRequestId: row.passport_request_id,
    provider: row.provider,
    orderNsu: row.order_nsu,
    invoiceSlug: row.invoice_slug ?? null,
    transactionNsu: row.transaction_nsu ?? null,
    amount: Number(row.amount ?? 0),
    paidAmount: row.paid_amount != null ? Number(row.paid_amount) : null,
    installments: row.installments ?? null,
    captureMethod: row.capture_method ?? null,
    receiptUrl: row.receipt_url ?? null,
    checkoutUrl: row.checkout_url ?? null,
    status: row.status,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? null,
  };
}

export async function logPagamento(
  event: string,
  payload: Record<string, unknown>,
  ids: { paymentId?: string | null; orderNsu?: string | null } = {},
) {
  try {
    await supabaseAdmin.from("passport_payment_logs").insert({
      passport_payment_id: ids.paymentId ?? null,
      order_nsu: ids.orderNsu ?? null,
      event,
      payload: payload as never,
    } as never);
  } catch (e) {
    console.error("[passaporte][log] falhou", event, e);
  }
}

const REUSO_MS = 6 * 60 * 60 * 1000; // 6h

/** Cria (ou reaproveita) o checkout InfinitePay de uma solicitação de passaporte. */
export async function obterCheckoutPassaporte(token: string): Promise<{
  checkoutUrl: string;
  orderNsu: string;
  status: string;
}> {
  const { data: reqRow, error: reqErr } = await supabaseAdmin
    .from("passport_requests")
    .select("id, token, applicant_name, applicant_email, applicant_phone, payment_status")
    .eq("token", token)
    .maybeSingle();
  if (reqErr) throw new Error(reqErr.message);
  if (!reqRow) throw new Error("Solicitação não encontrada.");
  const request = reqRow as Record<string, any>;
  if (request.payment_status === "paid") throw new Error("Esta solicitação já está paga.");

  // Reaproveita cobrança recente ainda aguardando pagamento (evita links duplicados).
  const { data: existentes } = await supabaseAdmin
    .from("passport_payments")
    .select("*")
    .eq("passport_request_id", request.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const reutilizavel = (existentes ?? []).find((r) => {
    const row = r as Record<string, any>;
    if (row.status === "PAGO") return false;
    if (row.status !== "AGUARDANDO_PAGAMENTO" || !row.checkout_url) return false;
    return Date.now() - new Date(row.created_at).getTime() < REUSO_MS;
  }) as Record<string, any> | undefined;

  if (reutilizavel) {
    return {
      checkoutUrl: reutilizavel.checkout_url,
      orderNsu: reutilizavel.order_nsu,
      status: reutilizavel.status,
    };
  }

  const orderNsu = gerarOrderNsu(request.id);
  try {
    const checkout = await criarCheckoutInfinitePay({
      orderNsu,
      token,
      customer: {
        name: request.applicant_name,
        email: request.applicant_email,
        phone: request.applicant_phone,
      },
    });

    const { data: inserted, error } = await supabaseAdmin
      .from("passport_payments")
      .insert({
        passport_request_id: request.id,
        provider: "infinitepay",
        order_nsu: orderNsu,
        invoice_slug: checkout.slug,
        amount: PASSAPORTE_VALOR_CENTAVOS,
        checkout_url: checkout.url,
        status: "AGUARDANDO_PAGAMENTO",
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await logPagamento(
      "infinitepay_checkout_created",
      { orderNsu, slug: checkout.slug, url: checkout.url },
      { paymentId: (inserted as Record<string, any>).id, orderNsu },
    );

    return { checkoutUrl: checkout.url, orderNsu, status: "AGUARDANDO_PAGAMENTO" };
  } catch (e) {
    await logPagamento(
      "infinitepay_checkout_error",
      { orderNsu, erro: e instanceof Error ? e.message : String(e) },
      { orderNsu },
    );
    throw e;
  }
}

/**
 * Confirmação server-to-server: nunca confia no frontend nem só no webhook.
 * Localiza a cobrança pelo order_nsu, consulta payment_check e só então marca PAGO.
 */
export async function confirmarPagamentoPassaporte(params: {
  orderNsu: string;
  transactionNsu?: string | null;
  slug?: string | null;
  receiptUrl?: string | null;
  origem: "webhook" | "retorno";
}): Promise<ConfirmacaoResultado> {
  const { data: found, error } = await supabaseAdmin
    .from("passport_payments")
    .select("*")
    .eq("order_nsu", params.orderNsu)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!found) throw new Error("Cobrança não encontrada para este pedido.");
  const pay = found as Record<string, any>;

  // Idempotência: já processado.
  if (pay.status === "PAGO") {
    if (params.origem === "webhook") {
      await logPagamento(
        "infinitepay_duplicate_webhook",
        { orderNsu: params.orderNsu, transactionNsu: params.transactionNsu },
        { paymentId: pay.id, orderNsu: pay.order_nsu },
      );
    }
    return {
      status: "PAGO",
      paid: true,
      amount: pay.paid_amount ?? pay.amount,
      installments: pay.installments ?? null,
      captureMethod: pay.capture_method ?? null,
      receiptUrl: pay.receipt_url ?? null,
    };
  }

  // transaction_nsu já usado por outra cobrança?
  if (params.transactionNsu) {
    const { data: outro } = await supabaseAdmin
      .from("passport_payments")
      .select("id, order_nsu")
      .eq("transaction_nsu", params.transactionNsu)
      .maybeSingle();
    if (outro && (outro as Record<string, any>).id !== pay.id) {
      await logPagamento(
        "infinitepay_duplicate_webhook",
        { orderNsu: params.orderNsu, transactionNsu: params.transactionNsu, conflito: outro },
        { paymentId: pay.id, orderNsu: pay.order_nsu },
      );
      return { status: pay.status, paid: false, amount: null, installments: null, captureMethod: null, receiptUrl: null, motivo: "transaction_nsu já processado em outra cobrança" };
    }
  }

  await supabaseAdmin
    .from("passport_payments")
    .update({ status: "PROCESSANDO" } as never)
    .eq("id", pay.id)
    .eq("status", "AGUARDANDO_PAGAMENTO");

  const check = await consultarPagamentoInfinitePay({
    orderNsu: params.orderNsu,
    transactionNsu: params.transactionNsu ?? null,
    slug: params.slug ?? pay.invoice_slug ?? null,
  });

  await logPagamento(
    "infinitepay_payment_check",
    { orderNsu: params.orderNsu, resposta: check.raw },
    { paymentId: pay.id, orderNsu: pay.order_nsu },
  );

  if (!check.success || !check.paid) {
    return {
      status: "PROCESSANDO",
      paid: false,
      amount: check.amount,
      installments: check.installments,
      captureMethod: check.captureMethod,
      receiptUrl: check.receiptUrl,
      motivo: "Pagamento ainda não confirmado pela InfinitePay.",
    };
  }

  const valorOk = (check.amount ?? check.paidAmount) === PASSAPORTE_VALOR_CENTAVOS;
  if (!valorOk) {
    await logPagamento(
      "infinitepay_invalid_amount",
      { orderNsu: params.orderNsu, amount: check.amount, paidAmount: check.paidAmount },
      { paymentId: pay.id, orderNsu: pay.order_nsu },
    );
    await supabaseAdmin
      .from("passport_payments")
      .update({ status: "ERRO", notes: "Valor divergente do esperado (R$ 320,00)." } as never)
      .eq("id", pay.id);
    return { status: "ERRO", paid: false, amount: check.amount, installments: check.installments, captureMethod: check.captureMethod, receiptUrl: check.receiptUrl, motivo: "Valor divergente" };
  }

  if (check.captureMethod !== "credit_card") {
    await logPagamento(
      "infinitepay_invalid_payment_method",
      { orderNsu: params.orderNsu, captureMethod: check.captureMethod },
      { paymentId: pay.id, orderNsu: pay.order_nsu },
    );
    await supabaseAdmin
      .from("passport_payments")
      .update({
        status: "ERRO",
        capture_method: check.captureMethod,
        notes: "FORMA DE PAGAMENTO INVÁLIDA PARA ESTE FLUXO — encaminhar para análise.",
      } as never)
      .eq("id", pay.id);
    return { status: "ERRO", paid: false, amount: check.amount, installments: check.installments, captureMethod: check.captureMethod, receiptUrl: check.receiptUrl, motivo: "Forma de pagamento inválida para este fluxo" };
  }

  const parcelas = check.installments ?? 1;
  let notas: string | null = null;
  if (parcelas < 1 || parcelas > PASSAPORTE_MAX_PARCELAS_CARTAO) {
    notas = `Parcelamento fora da regra (${parcelas}x) — verificar configuração do checkout.`;
    await logPagamento(
      "infinitepay_invalid_installments",
      { orderNsu: params.orderNsu, installments: parcelas },
      { paymentId: pay.id, orderNsu: pay.order_nsu },
    );
  }

  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("passport_payments")
    .update({
      status: "PAGO",
      paid_at: agora,
      paid_amount: check.paidAmount ?? check.amount,
      installments: parcelas,
      capture_method: check.captureMethod,
      receipt_url: check.receiptUrl ?? params.receiptUrl ?? null,
      transaction_nsu: params.transactionNsu ?? pay.transaction_nsu ?? null,
      invoice_slug: params.slug ?? pay.invoice_slug ?? null,
      notes: notas,
    } as never)
    .eq("id", pay.id);

  await supabaseAdmin
    .from("passport_requests")
    .update({
      payment_status: "paid",
      payment_method: "CREDIT_CARD",
      amount: PASSAPORTE_VALOR_CENTAVOS / 100,
      installments: parcelas,
      paid_at: agora,
      invoice_url: check.receiptUrl ?? params.receiptUrl ?? null,
      status: "enviado",
    } as never)
    .eq("id", pay.passport_request_id);

  await logPagamento(
    "infinitepay_payment_confirmed",
    { orderNsu: params.orderNsu, parcelas, receiptUrl: check.receiptUrl },
    { paymentId: pay.id, orderNsu: pay.order_nsu },
  );

  return {
    status: "PAGO",
    paid: true,
    amount: check.paidAmount ?? check.amount,
    installments: parcelas,
    captureMethod: check.captureMethod,
    receiptUrl: check.receiptUrl ?? params.receiptUrl ?? null,
  };
}
