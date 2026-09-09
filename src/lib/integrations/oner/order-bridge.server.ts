/**
 * Ponte entre o pedido VIA AIR (entidade principal) e a integração Oner.
 *
 * Regras:
 * - O pedido VIA AIR nasce assim que o cliente entra no fluxo de compra, já com
 *   voos, horários, passageiros, bagagem, tarifa, valor vendido e forma de pagamento.
 * - A Oner é apenas o fornecedor vinculado: nunca criamos um segundo pedido
 *   porque o fornecedor precisou de outro carrinho.
 * SERVER-ONLY.
 */
import { ONER_PROVIDER, type OnerPaymentMethod } from "./config";
import {
  buscarOperacaoPorPedido,
  criarOperacao,
  mudarEtapa,
  registrarEvento,
  registrarTentativaCarrinho,
  salvarPassageiros,
  type IntegrationOrder,
} from "./store.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type TrechoOner = {
  direction?: "outbound" | "return" | string;
  from_iata?: string | null;
  to_iata?: string | null;
  from_airport?: string | null;
  to_airport?: string | null;
  departure_date?: string | null;
  departure_time?: string | null;
  arrival_date?: string | null;
  arrival_time?: string | null;
  flight_number?: string | null;
  airline?: string | null;
  connections?: unknown;
  baggage?: string | null;
  fare_class?: string | null;
};

export type PassageiroOner = {
  firstName: string;
  lastName: string;
  passengerType?: string;
  birthDate?: string | null;
  documentNumber?: string | null;
  documentType?: string | null;
  gender?: string | null;
  nationality?: string | null;
  email?: string | null;
  phone?: string | null;
};

/**
 * Cria (ou reutiliza) o pedido VIA AIR e a operação Oner correspondente.
 * Chamado no início do checkout, antes de qualquer resposta do fornecedor.
 */
export async function registrarPedidoOner(input: {
  /** Quando informado, complementa um pedido VIA AIR já existente. */
  viaairOrderId?: string | null;
  paymentMethod: OnerPaymentMethod;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  /** Valor contratado pelo cliente. Nunca é substituído pelo líquido da Oner. */
  customerTotal: number;
  /** Valor original do carrinho no fornecedor. */
  providerOriginalTotal?: number | null;
  /** Comissão original da oferta. No cartão ela nunca é zerada. */
  commissionAmount?: number | null;
  productKind?: string | null;
  cartId?: string | null;
  offer: Record<string, unknown>;
  searchReference?: Record<string, unknown>;
  trechos?: TrechoOner[];
  passageiros?: PassageiroOner[];
  adults?: number;
  children?: number;
}): Promise<{ viaairOrderId: string; operacao: IntegrationOrder }> {
  const db = await admin();
  const trechos = input.trechos ?? [];
  const passageiros = input.passageiros ?? [];

  let viaairOrderId = input.viaairOrderId ?? null;

  if (!viaairOrderId) {
    const snapshot = {
      provider: "ONER",
      supplier: "COMPRAR_VIAGEM",
      manual: false,
      segments: trechos,
      offer: input.offer,
      search_reference: input.searchReference ?? {},
      travelers: passageiros.map((p) => ({
        full_name: `${p.firstName} ${p.lastName}`.trim(),
        kind: (p.passengerType ?? "ADT").toLowerCase() === "chd" ? "child" : (p.passengerType ?? "ADT").toLowerCase() === "inf" ? "infant" : "adult",
        birth_date: p.birthDate ?? null,
        cpf: p.documentNumber ?? null,
      })),
    };
    const { data, error } = await db
      .from("orders")
      .insert({
        full_name: input.customerName,
        email: input.customerEmail ?? null,
        phone: input.customerPhone ?? null,
        payment_method: input.paymentMethod === "PIX" ? "pix" : "credit_card",
        total_price: input.customerTotal,
        status: "pending",
        adults: input.adults ?? Math.max(1, passageiros.length || 1),
        children: input.children ?? 0,
        package_snapshot: snapshot as never,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(`Não foi possível criar o pedido: ${error.message}`);
    viaairOrderId = (data as { id: string }).id;

    // Trechos e passageiros já ficam visíveis no pedido antes de qualquer emissão.
    if (trechos.length) {
      await db.from("order_items").insert(
        trechos.map((t, i) => ({
          order_id: viaairOrderId,
          kind: "flight",
          status: "pending",
          title: `${t.airline ?? "Voo"} ${t.flight_number ?? ""} — ${t.from_iata ?? ""}→${t.to_iata ?? ""}`.trim(),
          details: t as never,
          sort_order: i,
        })) as never,
      );
    }
    if (passageiros.length) {
      await db.from("order_passengers").insert(
        passageiros.map((p, i) => ({
          order_id: viaairOrderId,
          full_name: `${p.firstName} ${p.lastName}`.trim(),
          passenger_type: (p.passengerType ?? "ADT").toUpperCase(),
          birth_date: p.birthDate || null,
          cpf: p.documentNumber || null,
          sort_order: i,
        })) as never,
      );
    }
  }

  const jaExiste = await buscarOperacaoPorPedido(viaairOrderId!);
  const operacao =
    jaExiste ??
    (await criarOperacao({
      viaairOrderId,
      productKind: input.productKind ?? "flight",
      offer: input.offer,
      amount: input.customerTotal,
      customerName: input.customerName,
      customerEmail: input.customerEmail ?? null,
      cartId: input.cartId ?? null,
      paymentMethod: input.paymentMethod,
      commissionAmount: input.commissionAmount ?? null,
      searchReference: input.searchReference ?? {},
    }));

  if (!jaExiste) {
    const db2 = await admin();
    await db2
      .from("integration_orders")
      .update({
        original_cart_id: input.cartId ?? null,
        customer_total: input.customerTotal,
        provider_original_total: input.providerOriginalTotal ?? null,
      } as never)
      .eq("id", operacao.id);

    await registrarTentativaCarrinho({
      viaairOrderId,
      integrationOrderId: operacao.id,
      cartId: input.cartId ?? null,
      purpose: "ORIGINAL_QUOTE",
      status: "open",
    });

    if (passageiros.length) await salvarPassageiros(operacao.id, passageiros);
  }

  return { viaairOrderId: viaairOrderId!, operacao };
}

/**
 * Chamado quando o Pix do cliente é confirmado pela VIA AIR.
 * O pedido passa a mostrar "Pagamento recebido — confirmando sua reserva".
 */
export async function marcarPagamentoClienteRecebido(viaairOrderId: string) {
  const op = await buscarOperacaoPorPedido(viaairOrderId);
  if (!op) return null;
  if (op.provider !== ONER_PROVIDER) return null;

  const db = await admin();
  await db
    .from("integration_orders")
    .update({ customer_payment_status: "paid" } as never)
    .eq("id", op.id);

  await registrarEvento({
    integrationOrderId: op.id,
    eventType: "customer_payment_received",
    message: "Pix do cliente confirmado",
  });

  // No cartão a automação segue sozinha; no Pix a equipe assume a preparação.
  const proximo = op.payment_method === "PIX" ? "ONER_MANUAL_PREPARATION" : "PAYMENT_RECEIVED";
  return mudarEtapa(op.id, proximo as never, { detail: "Pagamento do cliente recebido" });
}
