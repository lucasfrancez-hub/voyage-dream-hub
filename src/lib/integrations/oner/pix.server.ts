/**
 * Pix do fornecedor: gerar o QR Code na Comprar Viagem, conferir cada campo
 * e só então pagar pela conta bancária da VIA AIR.
 *
 * Duas transações distintas e independentes:
 *   1) Cliente → VIA AIR (cobrança própria);
 *   2) VIA AIR → Comprar Viagem (este arquivo).
 * SERVER-ONLY.
 */
import { ONER_API, chaveIdempotenciaPix } from "./config";
import { onerFetch, procurarFundo } from "./client.server";
import { atualizarOperacao, registrarEvento, type IntegrationOrder } from "./store.server";

/** Reconhece um Pix copia e cola. */
export function ehBrCode(texto: string): boolean {
  const s = String(texto || "").trim();
  return s.length >= 40 && (/^0002\d{2}/.test(s) || s.toLowerCase().includes("br.gov.bcb.pix"));
}

/** Lê os campos TLV de um BR Code (valor, beneficiário, cidade, txid). */
export function lerBrCode(payload: string) {
  const parse = (str: string) => {
    const out: Record<string, string> = {};
    let i = 0;
    while (i + 4 <= str.length) {
      const id = str.slice(i, i + 2);
      const len = Number(str.slice(i + 2, i + 4));
      if (!Number.isFinite(len)) break;
      out[id] = str.slice(i + 4, i + 4 + len);
      i += 4 + len;
    }
    return out;
  };
  const root = parse(String(payload || "").trim());
  const extra = root["62"] ? parse(root["62"]) : {};
  let chave: string | null = null;
  for (const id of ["26", "27", "28", "29", "30", "31"]) {
    const tpl = root[id];
    if (!tpl || !tpl.toLowerCase().includes("br.gov.bcb.pix")) continue;
    const sub = parse(tpl);
    if (sub["01"]) chave = sub["01"].trim();
  }
  return {
    chave,
    valor: root["54"] ? Number(root["54"]) : null,
    beneficiario: root["59"] ?? null,
    cidade: root["60"] ?? null,
    txid: extra["05"] ?? null,
  };
}

/** Pede o Pix do pedido na Comprar Viagem e captura o BR Code. */
export async function gerarPixFornecedor(op: IntegrationOrder, token: string) {
  const cartId = op.provider_cart_id;
  if (!cartId) return { ok: false, erro: "carrinho do fornecedor desconhecido" };

  const candidatos = [
    { url: `${ONER_API}/api/checkout/v1/payment/pix/${cartId}`, method: "POST" },
    { url: `${ONER_API}/api/payment/v1/pix`, method: "POST", body: { cartId } },
    { url: `${ONER_API}/api/checkout/v1/booking/${cartId}/payment/pix`, method: "POST" },
  ];
  for (const c of candidatos) {
    const r = await onerFetch(c.url, { method: c.method, body: c.body, token });
    await registrarEvento({
      integrationOrderId: op.id,
      eventType: "oner_pix_attempt",
      message: `${c.method} ${c.url} → ${r.call.status}`,
      payload: { call: r.call, resposta: r.raw.slice(0, 4000) },
    });
    if (!r.call.ok) continue;
    const brcode =
      (procurarFundo(r.body, (v) => typeof v === "string" && ehBrCode(v)) as string | undefined) ??
      (ehBrCode(r.raw) ? r.raw.trim() : undefined);
    if (!brcode) continue;
    const lido = lerBrCode(brcode);
    await atualizarOperacao(
      op.id,
      {
        provider_pix_brcode: brcode,
        provider_pix_payload: lido as never,
        provider_payment_status: "PENDING",
      },
      { eventType: "oner_pix_created", message: "QR Code do fornecedor capturado" },
    );
    return { ok: true, brcode, dados: lido };
  }
  return { ok: false, erro: "não foi possível gerar o Pix do fornecedor" };
}

/**
 * Confere o QR Code antes de pagar: valor, beneficiário e documento.
 * Qualquer divergência bloqueia o pagamento.
 */
export async function validarQrCode(op: IntegrationOrder) {
  const brcode = op.provider_pix_brcode;
  if (!brcode) return { ok: false, motivo: "sem QR Code do fornecedor" };
  const lido = lerBrCode(brcode);
  const esperado = Number(op.amount_provider ?? op.amount ?? 0);

  if (lido.valor != null && esperado > 0 && Math.abs(lido.valor - esperado) > 0.01) {
    return { ok: false, motivo: `valor do QR (${lido.valor}) diferente do pedido (${esperado})`, lido };
  }
  if (!lido.chave) return { ok: false, motivo: "QR Code sem chave Pix identificável", lido };

  const { lookupAsaasPixKey } = await import("@/lib/asaas.server");
  try {
    const titular = await lookupAsaasPixKey(brcode);
    await registrarEvento({
      integrationOrderId: op.id,
      eventType: "oner_pix_validated",
      message: `Beneficiário: ${titular.name}${titular.cpfCnpj ? ` (${titular.cpfCnpj})` : ""}`,
      payload: { valor: lido.valor ?? esperado, banco: titular.bankName },
    });
    return { ok: true, lido, titular, valor: lido.valor ?? esperado };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "chave Pix não confirmada", lido };
  }
}

/**
 * Paga o fornecedor. Idempotente por pedido F-...: se já existe pagamento
 * registrado, consulta o status em vez de pagar de novo.
 */
export async function pagarFornecedor(op: IntegrationOrder) {
  const numero = op.provider_order_number;
  if (!numero) return { ok: false, motivo: "pedido do fornecedor ainda não criado" };
  const chave = chaveIdempotenciaPix(numero);

  const { createAsaasPixTransfer, getAsaasTransfer } = await import("@/lib/asaas.server");

  // Já existe pagamento? Nunca pagar duas vezes — consultar primeiro.
  if (op.provider_payment_id) {
    const atual = await getAsaasTransfer(op.provider_payment_id).catch(() => null);
    const status = String(atual?.status ?? "").toUpperCase();
    await atualizarOperacao(
      op.id,
      { provider_payment_status: status || op.provider_payment_status },
      { eventType: "oner_payment_status", message: `Pagamento anterior: ${status || "desconhecido"}` },
    );
    return { ok: status === "DONE" || status === "CONFIRMED", jaExistia: true, status };
  }

  const validacao = await validarQrCode(op);
  if (!validacao.ok || !("titular" in validacao) || !validacao.titular) {
    return { ok: false, motivo: validacao.motivo ?? "QR Code não validado" };
  }

  await atualizarOperacao(op.id, { provider_pix_idempotency_key: chave, state: "ONER_PAYMENT_PROCESSING" }, {
    eventType: "oner_payment_start",
    message: `Pagamento iniciado (${chave})`,
  });

  try {
    const transferencia = await createAsaasPixTransfer({
      value: Number(validacao.valor),
      pixKey: validacao.titular.pixKey,
      pixKeyType: validacao.titular.pixKeyType,
      description: `Comprar Viagem ${numero}`,
      externalReference: chave,
    });
    const id = String(transferencia?.id ?? "");
    const status = String(transferencia?.status ?? "PENDING").toUpperCase();
    await atualizarOperacao(
      op.id,
      { provider_payment_id: id, provider_payment_status: status },
      { eventType: "oner_payment_sent", message: `Pagamento enviado (${status})` },
    );
    return { ok: true, id, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Erro desconhecido/timeout: NÃO repetir. Marca para conferência.
    await atualizarOperacao(
      op.id,
      { state: "MANUAL_REVIEW", last_error: `Pagamento ao fornecedor incerto: ${msg}` },
      { eventType: "oner_payment_error", message: `Falha/timeout no pagamento: ${msg}` },
    );
    return { ok: false, motivo: msg, revisar: true };
  }
}

/** Confere no banco se o pagamento ao fornecedor caiu. */
export async function conferirPagamentoFornecedor(op: IntegrationOrder) {
  if (!op.provider_payment_id) return { pago: false, status: null };
  const { getAsaasTransfer } = await import("@/lib/asaas.server");
  const t = await getAsaasTransfer(op.provider_payment_id).catch(() => null);
  const status = String(t?.status ?? "").toUpperCase();
  const pago = status === "DONE" || status === "CONFIRMED";
  if (status && status !== op.provider_payment_status) {
    await atualizarOperacao(
      op.id,
      { provider_payment_status: status },
      { eventType: "oner_payment_status", message: `Pagamento ao fornecedor: ${status}` },
    );
  }
  return { pago, status };
}
