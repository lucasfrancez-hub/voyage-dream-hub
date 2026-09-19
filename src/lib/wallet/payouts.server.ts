/**
 * Pagamento 2 — VIA AIR quita um Pix copia e cola de fornecedor.
 *
 * Genérico por desenho: a VIA AIR não sabe (nem precisa saber) de qual
 * fornecedor veio o código. Quem gera o Pix é quem consome a API.
 * Nada aqui cria reserva, consulta fornecedor ou revalida produto.
 * SERVER-ONLY.
 */
import {
  atualizarPagamento,
  db,
  dinheiro,
  lerCobranca,
  lerPagamento,
  pagamentoParaApi,
  registrarEvento,
  type PayoutStatus,
  type WalletPayout,
} from "./store.server";

/** Teto de saída automática. Acima disso o pagamento espera liberação humana. */
export function tetoAutomatico(): number {
  const bruto = Number(process.env["WALLET_PAYOUT_MAX_BRL"] ?? 0);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 5000;
}

export type PagarPixInput = {
  apiClientId: string;
  idempotencyKey: string;
  pixCopyPaste: string;
  amount?: number | null;
  orderId?: string | null;
  externalReference?: string | null;
  /** Referência da cobrança do cliente (paymentId devolvido na criação). */
  chargePaymentId?: string | null;
  expiresAt?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ResultadoPagamento =
  | { ok: true; payout: ReturnType<typeof pagamentoParaApi>; duplicate: boolean }
  | { ok: false; code: string; message: string; payout?: ReturnType<typeof pagamentoParaApi> };

function statusDoAsaas(bruto: string | null | undefined): PayoutStatus {
  const s = String(bruto ?? "").toUpperCase();
  if (s === "DONE") return "paid";
  if (s === "FAILED" || s === "CANCELLED" || s === "CANCELED" || s === "REFUSED") return "failed";
  if (s === "BANK_PROCESSING" || s === "IN_BANK_PROCESSING" || s === "PENDING") return "processing";
  return "processing";
}

async function avisar(evento: "wallet.payout.paid" | "wallet.payout.failed" | "wallet.payout.manual_review", payout: WalletPayout) {
  try {
    const { enfileirarEvento } = await import("@/lib/api/webhooks.server");
    await enfileirarEvento(evento, {
      payoutId: payout.id,
      orderId: payout.order_ref,
      externalReference: payout.external_reference,
      status: payout.status,
      amount: Number(payout.amount),
      transactionId: payout.asaas_transfer_id,
      paidAt: payout.paid_at,
      code: payout.fail_code,
      message: payout.fail_reason,
    });
  } catch {
    /* aviso nunca interrompe */
  }
}

export async function pagarPixCopiaECola(input: PagarPixInput): Promise<ResultadoPagamento> {
  const supabase = await db();
  const brcode = String(input.pixCopyPaste || "").trim();

  // 1) Idempotência: a mesma chave nunca executa uma segunda saída.
  const { data: jaExiste } = await supabase
    .from("wallet_payouts")
    .select("*")
    .eq("api_client_id", input.apiClientId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (jaExiste) {
    const atual = await sincronizarPagamento((jaExiste as unknown as WalletPayout).id);
    return { ok: true, payout: atual ?? pagamentoParaApi(jaExiste as unknown as WalletPayout), duplicate: true };
  }

  // 2) Vencimento informado por quem pediu: não tentamos pagar Pix vencido.
  if (input.expiresAt && new Date(input.expiresAt).getTime() < Date.now()) {
    return { ok: false, code: "pix_expired", message: "O Pix informado já venceu. Gere outro." };
  }

  // 3) Vínculo opcional com a cobrança do cliente (nunca sobrescreve nada dela).
  let chargeId: string | null = null;
  if (input.chargePaymentId) {
    const charge = await lerCobranca(input.chargePaymentId);
    if (!charge) {
      return { ok: false, code: "charge_not_found", message: "Cobrança do cliente não encontrada." };
    }
    if (charge.status !== "customer_paid") {
      return {
        ok: false,
        code: "customer_not_paid",
        message: "O cliente ainda não pagou esta cobrança — nada foi enviado ao fornecedor.",
      };
    }
    chargeId = charge.id;
  }

  // 4) Leitura do próprio BR Code: valor e recebedor reais, fonte de verdade.
  const { decodeAsaasPixBrCode, getAsaasBalance, payAsaasPixBrCode } = await import(
    "@/lib/asaas.server"
  );
  const info = await decodeAsaasPixBrCode(brcode).catch(() => null);
  if (info && info.canBePaid === false) {
    return { ok: false, code: "pix_expired", message: "Este Pix não pode mais ser pago (vencido ou já quitado)." };
  }
  const valor = dinheiro(info?.value ?? input.amount ?? 0);
  if (!(valor > 0)) {
    return { ok: false, code: "amount_unknown", message: "Não foi possível determinar o valor do Pix." };
  }
  const informado = dinheiro(input.amount ?? 0);
  if (informado > 0 && Math.abs(informado - valor) > 0.01) {
    return {
      ok: false,
      code: "amount_mismatch",
      message: `O valor do Pix (R$ ${valor.toFixed(2)}) difere do informado (R$ ${informado.toFixed(2)}). Nada foi pago.`,
    };
  }

  // 5) Registro antes de qualquer saída — auditoria existe mesmo se falhar.
  const { data: criado, error: erroCriar } = await supabase
    .from("wallet_payouts")
    .insert({
      api_client_id: input.apiClientId,
      charge_id: chargeId,
      idempotency_key: input.idempotencyKey,
      external_reference: input.externalReference ?? null,
      order_ref: input.orderId ?? null,
      amount: valor,
      currency: "BRL",
      pix_copy_paste: brcode,
      receiver_name: info?.receiverName ?? null,
      receiver_document: info?.receiverDocument ?? null,
      bank_name: info?.bankName ?? null,
      status: "pending",
      expires_at: input.expiresAt ?? null,
      metadata: (input.metadata ?? {}) as never,
    } as never)
    .select("*")
    .single();
  if (erroCriar || !criado) {
    // Corrida entre duas chamadas com a mesma chave: devolve a existente.
    const { data: concorrente } = await supabase
      .from("wallet_payouts")
      .select("*")
      .eq("api_client_id", input.apiClientId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (concorrente) {
      return { ok: true, payout: pagamentoParaApi(concorrente as unknown as WalletPayout), duplicate: true };
    }
    return { ok: false, code: "internal_error", message: "Não foi possível registrar o pagamento." };
  }
  let payout = criado as unknown as WalletPayout;
  await registrarEvento({
    payoutId: payout.id,
    chargeId,
    type: "payout.created",
    status: "pending",
    message: "Instrução de Pix recebida",
    payload: { amount: valor, receiver: info?.receiverName ?? null },
  });

  // 6) Teto de saída automática.
  const teto = tetoAutomatico();
  if (valor > teto) {
    await atualizarPagamento(payout.id, {
      status: "manual_review",
      fail_code: "above_auto_limit",
      fail_reason: `Valor acima do teto automático (R$ ${teto.toFixed(2)}) — aguardando liberação manual.`,
    });
    payout = (await lerPagamento(payout.id))!;
    await registrarEvento({
      payoutId: payout.id,
      type: "payout.manual_review",
      status: "manual_review",
      message: payout.fail_reason,
    });
    await avisar("wallet.payout.manual_review", payout);
    return {
      ok: false,
      code: "manual_review",
      message: payout.fail_reason ?? "Pagamento em revisão manual.",
      payout: pagamentoParaApi(payout),
    };
  }

  // 7) Saldo.
  const saldo = await getAsaasBalance().catch(() => 0);
  if (saldo > 0 && saldo < valor) {
    await atualizarPagamento(payout.id, {
      status: "failed",
      fail_code: "insufficient_balance",
      fail_reason: "Saldo insuficiente para o pagamento.",
    });
    payout = (await lerPagamento(payout.id))!;
    await avisar("wallet.payout.failed", payout);
    return { ok: false, code: "insufficient_balance", message: "Saldo insuficiente.", payout: pagamentoParaApi(payout) };
  }

  // 8) A conta usa autorização externa para toda saída: o registro interno
  // precisa existir ANTES da chamada, para o webhook conseguir aprovar.
  const { data: registro } = await supabase
    .from("asaas_transfers")
    .insert({
      status: "pendente",
      idempotency_key: `wallet-${payout.id}`,
      favored_name: info?.receiverName || "Fornecedor",
      pix_key: `brcode:${payout.id}`,
      pix_key_type: "QR_CODE",
      cpf_cnpj: info?.receiverDocument ?? null,
      bank_name: info?.bankName ?? null,
      value: valor,
      description: input.description || `Pagamento VIA AIR ${payout.id}`,
      origin: "outro",
    } as never)
    .select("id")
    .single();
  const transferRowId = (registro as { id: string } | null)?.id ?? null;
  if (!transferRowId) {
    await atualizarPagamento(payout.id, {
      status: "failed",
      fail_code: "authorization_setup_failed",
      fail_reason: "Não foi possível preparar a autorização da saída.",
    });
    payout = (await lerPagamento(payout.id))!;
    await avisar("wallet.payout.failed", payout);
    return {
      ok: false,
      code: "authorization_setup_failed",
      message: "Não foi possível preparar a autorização da saída.",
      payout: pagamentoParaApi(payout),
    };
  }

  await atualizarPagamento(payout.id, { status: "processing", transfer_row_id: transferRowId });

  try {
    const transfer: Record<string, unknown> = await payAsaasPixBrCode({
      payload: brcode,
      value: valor,
      description: input.description || `Pagamento VIA AIR ${payout.id}`,
      externalReference: transferRowId,
    });
    const asaasTransferId = String(
      (transfer["transferId"] as string | undefined) ?? (transfer["id"] as string | undefined) ?? "",
    );
    const bruto = String((transfer["status"] as string | undefined) ?? "PENDING").toUpperCase();
    const status = statusDoAsaas(bruto);

    await supabase
      .from("asaas_transfers")
      .update({
        asaas_transfer_id: asaasTransferId || null,
        status: status === "paid" ? "concluido" : status === "failed" ? "falhou" : "processando",
        asaas_status: bruto,
        raw_response: transfer as never,
      } as never)
      .eq("id", transferRowId);

    await atualizarPagamento(payout.id, {
      status,
      asaas_transfer_id: asaasTransferId || null,
      ...(status === "paid"
        ? { paid_at: new Date().toISOString(), paid_amount: valor }
        : {}),
      raw: transfer as never,
    });
    payout = (await lerPagamento(payout.id))!;
    await registrarEvento({
      payoutId: payout.id,
      chargeId,
      type: "payout.sent",
      status,
      message: `Saída enviada ao banco (${bruto})`,
    });
    if (status === "paid") await avisar("wallet.payout.paid", payout);
    return { ok: true, payout: pagamentoParaApi(payout), duplicate: false };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha ao pagar o Pix";
    await supabase
      .from("asaas_transfers")
      .update({ status: "falhou", fail_reason: mensagem.slice(0, 300) } as never)
      .eq("id", transferRowId);
    await atualizarPagamento(payout.id, {
      status: "failed",
      fail_code: "provider_error",
      fail_reason: mensagem.slice(0, 300),
    });
    payout = (await lerPagamento(payout.id))!;
    await registrarEvento({
      payoutId: payout.id,
      chargeId,
      type: "payout.failed",
      status: "failed",
      message: mensagem.slice(0, 300),
    });
    await avisar("wallet.payout.failed", payout);
    return { ok: false, code: "provider_error", message: mensagem.slice(0, 300), payout: pagamentoParaApi(payout) };
  }
}

/** Lê o estado real da saída no banco emissor e reflete aqui. */
export async function sincronizarPagamento(payoutId: string) {
  const payout = await lerPagamento(payoutId);
  if (!payout) return null;
  if (payout.status !== "processing" || !payout.asaas_transfer_id) {
    return pagamentoParaApi(payout);
  }
  try {
    const { getAsaasTransfer } = await import("@/lib/asaas.server");
    const t = await getAsaasTransfer(payout.asaas_transfer_id);
    const status = statusDoAsaas(t?.status);
    if (status !== payout.status) {
      await atualizarPagamento(payout.id, {
        status,
        ...(status === "paid"
          ? { paid_at: t?.effectiveDate ?? new Date().toISOString(), paid_amount: Number(payout.amount) }
          : {}),
        ...(status === "failed"
          ? { fail_code: "transfer_failed", fail_reason: t?.failReason ?? "Transferência não concluída." }
          : {}),
      });
      const atualizado = (await lerPagamento(payout.id))!;
      await registrarEvento({
        payoutId: payout.id,
        type: `payout.${status}`,
        status,
        message: `Situação atualizada pelo banco (${String(t?.status ?? "")})`,
      });
      if (status === "paid") await avisar("wallet.payout.paid", atualizado);
      if (status === "failed") await avisar("wallet.payout.failed", atualizado);
      return pagamentoParaApi(atualizado);
    }
  } catch {
    /* consulta indisponível: devolve o último estado conhecido */
  }
  return pagamentoParaApi(payout);
}
