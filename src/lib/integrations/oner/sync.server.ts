/**
 * Acompanhamento das operações: consulta o fornecedor, avança as etapas e
 * guarda localizador, bilhetes e documentos. Roda por chamada agendada.
 * SERVER-ONLY.
 */
import { ONER_FINAL_STATES } from "./config";
import {
  agendarProximaConsulta,
  atualizarOperacao,
  buscarOperacao,
  mudarEtapa,
  operacoesPendentes,
  registrarEvento,
  salvarBilhetes,
  type IntegrationOrder,
} from "./store.server";
import { obterToken, tokenAtual } from "./session.server";
import { consultarCarrinhoFornecedor, lerDetalheVenda, localizarVenda } from "./sales.server";
import { conferirPagamentoFornecedor } from "./pix.server";

/** Um passo de acompanhamento de uma operação. */
export async function sincronizarOperacao(id: string) {
  const op = await buscarOperacao(id);
  if (!op) return { ok: false, motivo: "operação não encontrada" };
  if (ONER_FINAL_STATES.includes(op.state)) return { ok: true, estado: op.state, final: true };

  const token = (await tokenAtual()) ?? (await obterToken({ integrationOrderId: op.id, esperarCodigoMs: 0 }));
  if (!token) {
    await mudarEtapa(op.id, "ONER_AUTH_REQUIRED", {
      detail: "Precisa do código de acesso da Comprar Viagem",
    });
    return { ok: false, motivo: "sessão do fornecedor indisponível" };
  }

  // 1) O pagamento ao fornecedor caiu?
  if (op.provider_payment_id && op.provider_payment_status !== "DONE") {
    const r = await conferirPagamentoFornecedor(op);
    if (r.pago && op.state !== "ONER_PAID") {
      await mudarEtapa(op.id, "ONER_PAID", { detail: "Fornecedor pago" });
    }
  }

  // 2) Ainda em carrinho no fornecedor?
  const numero = op.provider_order_number;
  if (numero) {
    const carrinho = await consultarCarrinhoFornecedor(token, numero, op.id);
    if (carrinho.status) {
      await atualizarOperacao(op.id, { provider_status: carrinho.status });
    }
  }

  // 3) Virou venda?
  let saleId = op.provider_sale_id;
  if (!saleId && numero) {
    const encontrada = await localizarVenda(token, numero, op.id);
    if (encontrada.saleId) {
      saleId = encontrada.saleId;
      await atualizarOperacao(
        op.id,
        { provider_sale_id: saleId, state: "ONER_SALE_FOUND" },
        { eventType: "state_change", message: `Venda ${saleId} localizada` },
      );
    } else if (op.state !== "ONER_SALE_WAITING" && op.state === "ONER_PAID") {
      await mudarEtapa(op.id, "ONER_SALE_WAITING", { detail: "Aguardando o pedido virar venda" });
    }
  }

  // 4) Detalhe da venda: localizador, bilhetes, documentos.
  if (saleId) {
    const detalhe = await lerDetalheVenda(token, saleId, op.id);
    if (detalhe) {
      const patch: Record<string, unknown> = {
        sale_detail: detalhe.bruto as never,
        provider_status: detalhe.status ?? op.provider_status,
      };
      if (detalhe.locator) patch["locator"] = detalhe.locator;
      if (detalhe.hotelLocator) patch["hotel_locator"] = detalhe.hotelLocator;

      const bilhetesValidos = detalhe.bilhetes.filter((b) => b.ticketNumber);
      if (bilhetesValidos.length) await salvarBilhetes(op.id, bilhetesValidos);

      const proximo =
        bilhetesValidos.length > 0
          ? "TICKETS_RECEIVED"
          : detalhe.locator
            ? "LOCATOR_RECEIVED"
            : "WAITING_RESERVATION_DETAILS";
      patch["state"] = proximo;
      await atualizarOperacao(op.id, patch, {
        eventType: "state_change",
        message:
          proximo === "TICKETS_RECEIVED"
            ? `${bilhetesValidos.length} bilhete(s) recebido(s)`
            : proximo === "LOCATOR_RECEIVED"
              ? `Localizador ${detalhe.locator}`
              : "Aguardando dados da reserva",
      });

      if (bilhetesValidos.length && detalhe.locator) {
        await mudarEtapa(op.id, "COMPLETE", { detail: "Reserva emitida e sincronizada" });
        return { ok: true, estado: "COMPLETE", final: true };
      }
    }
  }

  const atualizada = (await buscarOperacao(op.id)) as IntegrationOrder;
  await agendarProximaConsulta(atualizada);
  return { ok: true, estado: atualizada.state };
}

/** Roda um lote de operações pendentes (chamada pelo agendador). */
export async function sincronizarPendentes(limite = 10) {
  const pendentes = await operacoesPendentes(limite);
  const resultados: Array<{ id: string; estado?: string; erro?: string }> = [];
  for (const op of pendentes) {
    try {
      const r = await sincronizarOperacao(op.id);
      resultados.push({ id: op.id, estado: r.ok ? String(r.estado ?? "") : undefined, erro: r.ok ? undefined : r.motivo });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await registrarEvento({
        integrationOrderId: op.id,
        eventType: "sync_error",
        message: `Falha ao sincronizar: ${msg}`,
      });
      await atualizarOperacao(op.id, {
        last_error: msg,
        attempts: op.attempts + 1,
        ...(op.attempts + 1 >= 10 ? { state: "MANUAL_REVIEW" } : {}),
      });
      resultados.push({ id: op.id, erro: msg });
    }
  }
  return { processadas: resultados.length, resultados };
}
