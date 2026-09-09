/**
 * Funções usadas pela seção "Integração Oner" dentro da tela de Pedidos.
 * Não existe central separada: tudo acontece no mesmo pedido VIA AIR.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ONER_STATE_LABEL, type OnerState } from "./config";

async function exigirAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Acesso restrito");
}

export type CarrinhoTentativa = {
  id: string;
  cart_id: string | null;
  purpose: string;
  status: string;
  created_at: string;
};

export type LinhaTempoItem = {
  id: string;
  event_type: string;
  message: string | null;
  state: string | null;
  created_at: string;
};

export type IntegracaoOnerDoPedido = {
  id: string;
  paymentMethod: "CARD" | "PIX";
  state: string;
  etapa: string;
  providerStatus: string | null;
  originalCartId: string | null;
  fulfillmentCartId: string | null;
  providerOrderNumber: string | null;
  providerSaleId: string | null;
  locator: string | null;
  lastSyncAt: string | null;
  customerTotal: number | null;
  providerOriginalTotal: number | null;
  providerNetTotal: number | null;
  commissionOriginal: number | null;
  commissionFinal: number | null;
  margem: number | null;
  customerPaymentStatus: string | null;
  providerPaymentStatus: string | null;
  providerPixBrcode: string | null;
  providerPixExpiresAt: string | null;
  providerPaymentAuthorizedAt: string | null;
  podeAutorizar: boolean;
  motivosBloqueio: string[];
  carrinhos: CarrinhoTentativa[];
  bilhetes: Array<{ ticket_number: string | null; passenger_name: string | null; status: string | null }>;
  linhaTempo: LinhaTempoItem[];
  notas: string | null;
};

/** Regras do botão "Autorizar pagamento". Avaliadas sempre no servidor. */
function avaliarAutorizacao(op: any): { pode: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (op.payment_method !== "PIX") motivos.push("Autorização manual só existe no Pix.");
  if (op.customer_payment_status !== "paid") motivos.push("Pix do cliente ainda não confirmado.");
  if (!op.fulfillment_cart_id) motivos.push("Carrinho operacional da Oner não informado.");
  if (op.commission_final == null || Number(op.commission_final) !== 0)
    motivos.push("Comissão ainda não foi zerada.");
  if (!op.provider_net_amount || Number(op.provider_net_amount) <= 0)
    motivos.push("Valor líquido da Oner não confirmado.");
  if (!op.provider_pix_brcode) motivos.push("Cobrança Pix da Oner não registrada.");
  if (op.provider_pix_expires_at && new Date(op.provider_pix_expires_at).getTime() < Date.now())
    motivos.push("Cobrança Pix da Oner venceu.");
  if (op.provider_payment_status === "paid" || op.provider_payment_status === "processing")
    motivos.push("Pagamento ao fornecedor já iniciado.");
  return { pode: motivos.length === 0, motivos };
}

export const onerDoPedido = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<IntegracaoOnerDoPedido | null> => {
    await exigirAdmin(context as never);
    const { buscarOperacaoPorPedido, listarTentativasCarrinho, listarBilhetes, listarEventos } =
      await import("./store.server");
    const op = (await buscarOperacaoPorPedido(data.orderId)) as any;
    if (!op) return null;

    const carrinhos = await listarTentativasCarrinho(op.id);
    const bilhetes = (await listarBilhetes(op.id)) as any[];
    const eventos = (await listarEventos(op.id, 100)) as any[];
    const { pode, motivos } = avaliarAutorizacao(op);

    const cliente = op.customer_total ?? op.amount ?? null;
    const liquido = op.provider_net_amount ?? null;

    return {
      id: op.id,
      paymentMethod: op.payment_method === "PIX" ? "PIX" : "CARD",
      state: op.state,
      etapa: ONER_STATE_LABEL[op.state as OnerState] ?? op.state,
      providerStatus: op.provider_status,
      originalCartId: op.original_cart_id ?? op.provider_cart_id,
      fulfillmentCartId: op.fulfillment_cart_id,
      providerOrderNumber: op.provider_order_number,
      providerSaleId: op.provider_sale_id,
      locator: op.locator,
      lastSyncAt: op.last_sync_at,
      customerTotal: cliente,
      providerOriginalTotal: op.provider_original_total,
      providerNetTotal: liquido,
      commissionOriginal: op.commission_amount,
      commissionFinal: op.commission_final,
      margem: cliente != null && liquido != null ? Number(cliente) - Number(liquido) : null,
      customerPaymentStatus: op.customer_payment_status,
      providerPaymentStatus: op.provider_payment_status,
      providerPixBrcode: op.provider_pix_brcode,
      providerPixExpiresAt: op.provider_pix_expires_at,
      providerPaymentAuthorizedAt: op.provider_payment_authorized_at,
      podeAutorizar: pode,
      motivosBloqueio: motivos,
      carrinhos: carrinhos.map((c) => ({
        id: c.id,
        cart_id: c.cart_id,
        purpose: c.purpose,
        status: c.status,
        created_at: c.created_at,
      })),
      bilhetes: bilhetes.map((b) => ({
        ticket_number: b.ticket_number ?? null,
        passenger_name: b.passenger_name ?? null,
        status: b.status ?? null,
      })),
      linhaTempo: eventos
        .map((e) => ({
          id: String(e.id),
          event_type: String(e.event_type),
          message: e.message ?? null,
          state: e.state ?? null,
          created_at: String(e.created_at),
        }))
        .reverse(),
      notas: op.manual_notes ?? null,
    };
  });

/** Registra o carrinho recriado pela equipe para o Pix, sem apagar o anterior. */
export const onerRegistrarCarrinhoOperacional = createServerFn({ method: "POST" })
  .inputValidator((d: { integrationOrderId: string; cartId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { atualizarOperacao, buscarOperacao, registrarTentativaCarrinho } = await import("./store.server");
    const op = await buscarOperacao(data.integrationOrderId);
    if (!op) throw new Error("Operação não encontrada");
    if (op.payment_method !== "PIX") throw new Error("Só o Pix usa carrinho operacional");

    await registrarTentativaCarrinho({
      viaairOrderId: op.viaair_order_id,
      integrationOrderId: op.id,
      cartId: data.cartId,
      purpose: "PIX_REBOOK",
      status: "open",
    });
    await atualizarOperacao(
      op.id,
      { fulfillment_cart_id: data.cartId, state: "ONER_CART_READY" },
      { eventType: "pix_cart_ready", message: `Carrinho operacional ${data.cartId}` },
    );
    return { ok: true };
  });

/** Comissão zerada no carrinho operacional + valor líquido conferido. */
export const onerRegistrarComissaoZerada = createServerFn({ method: "POST" })
  .inputValidator((d: { integrationOrderId: string; providerNetTotal: number }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { atualizarOperacao, buscarOperacao } = await import("./store.server");
    const op = await buscarOperacao(data.integrationOrderId);
    if (!op) throw new Error("Operação não encontrada");
    if (op.payment_method !== "PIX") throw new Error("Comissão só é ajustada no fluxo Pix");
    if (!(data.providerNetTotal > 0)) throw new Error("Informe o valor líquido da Oner");

    const cliente = Number(op.customer_total ?? op.amount ?? 0);
    await atualizarOperacao(
      op.id,
      {
        commission_final: 0,
        provider_net_amount: data.providerNetTotal,
        viaair_margin: cliente ? cliente - data.providerNetTotal : null,
        state: "ONER_COMMISSION_ZEROED",
      },
      { eventType: "pix_commission_zeroed", message: `Líquido Oner R$ ${data.providerNetTotal.toFixed(2)}` },
    );
    return { ok: true };
  });

/** Cobrança Pix gerada na Oner. */
export const onerRegistrarPixFornecedor = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      integrationOrderId: string;
      brcode: string;
      valor?: number | null;
      vencimento?: string | null;
      identificador?: string | null;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { atualizarOperacao, buscarOperacao } = await import("./store.server");
    const op = await buscarOperacao(data.integrationOrderId);
    if (!op) throw new Error("Operação não encontrada");
    if (op.payment_method !== "PIX") throw new Error("Só o fluxo Pix registra cobrança do fornecedor");

    await atualizarOperacao(
      op.id,
      {
        provider_pix_brcode: data.brcode.trim(),
        provider_pix_expires_at: data.vencimento || null,
        provider_payment_id: data.identificador || null,
        provider_payment_status: "pending",
        ...(data.valor ? { provider_net_amount: data.valor } : {}),
        state: "PROVIDER_PAYMENT_AUTHORIZATION_REQUIRED",
      },
      { eventType: "provider_pix_ready", message: "Pix da Oner registrado" },
    );
    return { ok: true };
  });

export const onerRegistrarPedidoFornecedor = createServerFn({ method: "POST" })
  .inputValidator((d: { integrationOrderId: string; numeroPedido: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { atualizarOperacao } = await import("./store.server");
    await atualizarOperacao(
      data.integrationOrderId,
      { provider_order_number: data.numeroPedido.trim().toUpperCase() },
      { eventType: "provider_order_found", message: data.numeroPedido },
    );
    return { ok: true };
  });

export const onerSalvarNotas = createServerFn({ method: "POST" })
  .inputValidator((d: { integrationOrderId: string; notas: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { atualizarOperacao } = await import("./store.server");
    await atualizarOperacao(data.integrationOrderId, { manual_notes: data.notas });
    return { ok: true };
  });

/**
 * Autoriza e executa o pagamento da cobrança da Oner pela conta bancária.
 * Todas as condições são revalidadas aqui — a tela nunca é a fonte de verdade.
 * Em caso de tempo esgotado, consultamos a transação anterior em vez de repetir.
 */
export const onerAutorizarPagamento = createServerFn({ method: "POST" })
  .inputValidator((d: { integrationOrderId: string; confirmado: true }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { atualizarOperacao, buscarOperacao, registrarEvento } = await import("./store.server");
    const op = (await buscarOperacao(data.integrationOrderId)) as any;
    if (!op) throw new Error("Operação não encontrada");

    // Já existe transferência iniciada: consulta em vez de pagar de novo.
    if (op.provider_payment_reference) {
      const { getAsaasTransfer } = await import("@/lib/asaas.server");
      const t = await getAsaasTransfer(op.provider_payment_reference).catch(() => null);
      const status = String(t?.status ?? "").toUpperCase();
      const pago = status === "DONE" || status === "CONFIRMED";
      await atualizarOperacao(
        op.id,
        {
          provider_payment_status: pago ? "paid" : "processing",
          state: pago ? "PROVIDER_PAID" : "PROVIDER_PAYMENT_PROCESSING",
        },
        { eventType: "provider_payment_recheck", message: `Status anterior: ${status || "desconhecido"}` },
      );
      return { ok: true, jaIniciado: true, status: status || "desconhecido" };
    }

    const { pode, motivos } = avaliarAutorizacao(op);
    if (!pode) return { ok: false as const, motivos };

    await atualizarOperacao(
      op.id,
      {
        state: "PROVIDER_PAYMENT_PROCESSING",
        provider_payment_status: "processing",
        provider_payment_authorized_at: new Date().toISOString(),
        provider_payment_authorized_by: (context as any).userId,
      },
      { eventType: "provider_payment_authorized", message: "Pagamento autorizado" },
    );

    const { payAsaasPixBrCode } = await import("@/lib/asaas.server");
    const referencia = `oner_${op.id}`;
    try {
      const t = await payAsaasPixBrCode({
        payload: op.provider_pix_brcode,
        value: Number(op.provider_net_amount),
        description: `Oner ${op.provider_order_number ?? op.fulfillment_cart_id ?? ""}`.trim(),
        externalReference: referencia,
      });
      const status = String(t?.status ?? "").toUpperCase();
      const pago = status === "DONE" || status === "CONFIRMED";
      await atualizarOperacao(
        op.id,
        {
          provider_payment_reference: t?.id ?? referencia,
          provider_payment_status: pago ? "paid" : "processing",
          state: pago ? "PROVIDER_PAID" : "PROVIDER_PAYMENT_PROCESSING",
        },
        { eventType: "provider_paid", message: `Transferência ${t?.id ?? ""} — ${status}` },
      );
      return { ok: true as const, status: status || "processando" };
    } catch (e) {
      await registrarEvento({
        integrationOrderId: op.id,
        eventType: "provider_payment_error",
        message: e instanceof Error ? e.message : "Falha ao pagar",
      });
      await atualizarOperacao(op.id, {
        provider_payment_status: "error",
        state: "MANUAL_REVIEW",
        last_error: e instanceof Error ? e.message : "Falha ao pagar",
      });
      return { ok: false as const, motivos: ["Não foi possível concluir o pagamento. Confira a transferência antes de tentar de novo."] };
    }
  });
