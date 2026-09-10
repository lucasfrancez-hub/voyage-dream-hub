/**
 * Liga o checkout do portal ao pedido VIA AIR já existente ("Meus pedidos").
 *
 * Regras:
 * - Todo checkout feito dentro do portal vira um pedido VIA AIR, com voos,
 *   passageiros, valor e forma de pagamento — nunca um pedido paralelo.
 * - Pix: o pagamento sobe para a Oner, mas o carrinho precisa ser refeito
 *   sem comissão em até 30 minutos. Por isso o pedido nasce como tarefa
 *   manual com prazo visível para a equipe.
 * SERVER-ONLY.
 */
import type { OnerPaymentMethod } from "./config";
import { registrarPedidoOner, type PassageiroOner, type TrechoOner } from "./order-bridge.server";
import {
  atualizarOperacao,
  buscarOperacaoPorCarrinho,
  mudarEtapa,
  registrarEvento,
} from "./store.server";

/** Minutos que a equipe tem para refazer o carrinho sem comissão no Pix. */
export const ONER_PIX_PRAZO_MINUTOS = 30;

function partirNome(completo: string): { firstName: string; lastName: string } {
  const partes = completo.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { firstName: partes[0] ?? "", lastName: "" };
  return { firstName: partes[0]!, lastName: partes.slice(1).join(" ") };
}

async function orders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PassageiroDoCheckout = {
  nome: string;
  sobrenome: string;
  tipo?: string;
  nascimento?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
};

/**
 * Cria (ou reaproveita) o pedido VIA AIR do carrinho. Idempotente por carrinho.
 */
export async function abrirPedidoDoCarrinho(input: {
  cartId: string;
  metodo: OnerPaymentMethod;
  passageiros?: PassageiroDoCheckout[];
}): Promise<{ viaairOrderId: string | null; integrationOrderId: string | null }> {
  const existente = await buscarOperacaoPorCarrinho(input.cartId);
  if (existente) {
    if (existente.payment_method !== input.metodo) {
      await atualizarOperacao(existente.id, { payment_method: input.metodo });
    }
    return { viaairOrderId: existente.viaair_order_id, integrationOrderId: existente.id };
  }

  const { obterToken } = await import("./session.server");
  const { lerCarrinho } = await import("./checkout.server");
  const token = await obterToken({});
  if (!token) return { viaairOrderId: null, integrationOrderId: null };

  const carrinho = await lerCarrinho(input.cartId, token);
  const resumo = carrinho.resumo;
  if (!resumo) return { viaairOrderId: null, integrationOrderId: null };

  const trechos: TrechoOner[] = resumo.voos.flatMap((v, iv) =>
    v.segmentos.map((s) => ({
      direction: iv === 0 ? "outbound" : "return",
      from_iata: s.saida.iata,
      to_iata: s.chegada.iata,
      from_airport: s.saida.aeroporto,
      to_airport: s.chegada.aeroporto,
      departure_date: s.saida.data,
      departure_time: s.saida.hora,
      arrival_date: s.chegada.data,
      arrival_time: s.chegada.hora,
      flight_number: s.voo,
      airline: s.cia,
      connections: v.conexoes,
      baggage: v.bagagemMao,
      fare_class: s.familia,
    })),
  );

  const informados = input.passageiros ?? [];
  const passageiros: PassageiroOner[] = (
    informados.length
      ? informados.map((p) => ({
          firstName: p.nome,
          lastName: p.sobrenome,
          passengerType: p.tipo ?? "ADT",
          birthDate: p.nascimento ?? null,
          documentNumber: p.documento ?? null,
          email: p.email ?? null,
          phone: p.telefone ?? null,
        }))
      : resumo.passageiros.map((p) => ({
          ...partirNome(p.nome),
          passengerType: p.tipo || "ADT",
        }))
  ).filter((p) => p.firstName);

  const contato = informados[0];
  const nomeCliente =
    passageiros[0] ? `${passageiros[0].firstName} ${passageiros[0].lastName}`.trim() : "Cliente";

  const { viaairOrderId, operacao } = await registrarPedidoOner({
    paymentMethod: input.metodo,
    customerName: nomeCliente,
    customerEmail: contato?.email ?? null,
    customerPhone: contato?.telefone ?? null,
    customerTotal: resumo.total ?? 0,
    providerOriginalTotal: resumo.total ?? null,
    productKind: "flight",
    cartId: input.cartId,
    offer: { resumo } as unknown as Record<string, unknown>,
    searchReference: { cartId: input.cartId },
    trechos,
    passageiros,
    adults: resumo.adultos ?? (passageiros.length || 1),
    children: (resumo.criancas ?? 0) + (resumo.bebes ?? 0),
  });

  return { viaairOrderId, integrationOrderId: operacao.id };
}

/**
 * Conclui o checkout no pedido VIA AIR.
 * - Cartão: pedido finalizado, com localizador.
 * - Pix: pagamento sobe para a Oner e abre a tarefa de 30 minutos para
 *   refazer o carrinho sem comissão.
 */
export async function concluirPedidoDoCarrinho(input: {
  cartId: string;
  metodo: OnerPaymentMethod;
  localizador?: string | null;
  pixBrcode?: string | null;
  pixExpiraEm?: string | null;
}) {
  const aberto = await abrirPedidoDoCarrinho({ cartId: input.cartId, metodo: input.metodo });
  if (!aberto.integrationOrderId) return { ok: false as const };
  const db = await orders();

  if (input.metodo === "CARD") {
    await mudarEtapa(aberto.integrationOrderId, "LOCATOR_RECEIVED", {
      detail: "Pagamento aprovado no cartão do cliente",
      extra: {
        locator: input.localizador ?? null,
        customer_payment_status: "paid",
      },
    });
    if (aberto.viaairOrderId) {
      await db.from("orders").update({ status: "paid" } as never).eq("id", aberto.viaairOrderId);
    }
    return { ok: true as const, viaairOrderId: aberto.viaairOrderId };
  }

  const prazo = new Date(Date.now() + ONER_PIX_PRAZO_MINUTOS * 60_000);
  const prazoBR = prazo.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  await mudarEtapa(aberto.integrationOrderId, "PIX_MANUAL_PREPARATION", {
    detail: `Pix gerado na Oner — refazer o carrinho sem comissão até ${prazoBR}`,
    extra: {
      provider_pix_brcode: input.pixBrcode ?? null,
      provider_pix_expires_at: input.pixExpiraEm ?? prazo.toISOString(),
    },
  });
  await registrarEvento({
    integrationOrderId: aberto.integrationOrderId,
    eventType: "pix_manual_task_open",
    state: "PIX_MANUAL_PREPARATION",
    message: `Pix do checkout: refazer o carrinho sem comissão em até ${ONER_PIX_PRAZO_MINUTOS} minutos (até ${prazoBR})`,
    payload: { cartId: input.cartId, prazo: prazo.toISOString() },
  });

  return { ok: true as const, viaairOrderId: aberto.viaairOrderId, prazo: prazo.toISOString() };
}
