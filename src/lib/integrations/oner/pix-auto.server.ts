/**
 * Pix do checkout de voo: quando o Pix do cliente (VIA AIR/Asaas) é
 * confirmado, pagamos o fornecedor IMEDIATAMENTE — sem esperar a janela
 * manual de 30 minutos. Se qualquer etapa falhar (sessão, QR, valor),
 * a tarefa manual continua aberta como plano B.
 * SERVER-ONLY.
 */
import {
  atualizarOperacao,
  buscarOperacao,
  buscarOperacaoPorPedido,
  mudarEtapa,
  registrarEvento,
} from "./store.server";

export async function pagarFornecedorAposPixCliente(viaairOrderId: string) {
  const op = await buscarOperacaoPorPedido(viaairOrderId);
  if (!op) return { ok: false as const, motivo: "pedido sem operação Oner vinculada" };
  if (op.payment_method !== "PIX") return { ok: false as const, motivo: "pagamento não é Pix" };

  const status = String(op.provider_payment_status ?? "").toUpperCase();
  if (op.provider_payment_id && (status === "DONE" || status === "CONFIRMED")) {
    return { ok: true as const, jaPago: true as const };
  }

  // Sessão de compra: renova sozinha (código por e-mail) se estiver vencida.
  const { obterToken } = await import("./session.server");
  const token = await obterToken({ integrationOrderId: op.id, esperarCodigoMs: 20_000 });
  if (!token) {
    await registrarEvento({
      integrationOrderId: op.id,
      eventType: "oner_auto_pix_session_failed",
      message: "Pix do cliente confirmado, mas a sessão de compra não renovou — tarefa manual segue aberta",
      payload: { viaairOrderId },
    });
    return { ok: false as const, motivo: "sessão de compra indisponível" };
  }

  const { gerarPixFornecedor, pagarFornecedor } = await import("./pix.server");

  let atual = op;
  if (!op.provider_pix_brcode) {
    const gerado = await gerarPixFornecedor(op, token);
    if (!gerado.ok) {
      await registrarEvento({
        integrationOrderId: op.id,
        eventType: "oner_auto_pix_qr_failed",
        message: `Não consegui gerar o Pix do fornecedor: ${gerado.erro}`,
        payload: { viaairOrderId },
      });
      return { ok: false as const, motivo: gerado.erro };
    }
    atual = (await buscarOperacao(op.id)) ?? op;
  }

  const pago = await pagarFornecedor(atual);
  if (!pago.ok) {
    await registrarEvento({
      integrationOrderId: op.id,
      eventType: "oner_auto_pix_pay_failed",
      message: `Pagamento automático ao fornecedor não concluído: ${pago.motivo ?? "erro"}`,
      payload: { viaairOrderId },
    });
    return { ok: false as const, motivo: pago.motivo ?? "pagamento não concluído" };
  }

  await mudarEtapa(op.id, "PROVIDER_PAID", {
    detail: "Pix do cliente confirmado — fornecedor pago automaticamente",
    extra: { auto_paid_after_customer_pix: true },
  });
  await atualizarOperacao(op.id, { customer_payment_status: "paid" });
  await registrarEvento({
    integrationOrderId: op.id,
    eventType: "pix_manual_task_done",
    message: "Tarefa manual do Pix encerrada: pagamento ao fornecedor feito automaticamente",
    payload: { viaairOrderId },
  });

  // Emite aviso para consumidores da API interna (Sky Hub), best-effort.
  try {
    const { enfileirarEvento } = await import("@/lib/api/webhooks.server");
    await enfileirarEvento("supplier.payment.paid", {
      orderId: viaairOrderId,
      paidAt: new Date().toISOString(),
    });
  } catch {
    /* aviso nunca interrompe o fluxo */
  }

  return { ok: true as const };
}
