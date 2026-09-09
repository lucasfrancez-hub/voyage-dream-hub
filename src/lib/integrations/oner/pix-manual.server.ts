/**
 * PIX — fluxo manual/assistido da Comprar Viagem / Oner.
 *
 * Nesta primeira versão o sistema NÃO recria o carrinho, NÃO mexe na comissão
 * e NÃO paga a Oner automaticamente quando o cliente escolhe Pix. Ele apenas
 * guarda tudo (compra, passageiros, valores, referências da busca), cria a
 * tarefa no painel e acompanha, passo a passo, o que a equipe fez à mão.
 *
 * SERVER-ONLY.
 */
import { ONER_PIX_STEPS, type OnerPixStep } from "./config";
import {
  atualizarOperacao,
  buscarOperacao,
  criarOperacao,
  listarBilhetes,
  listarPassageiros,
  marcarEtapaManual,
  registrarEvento,
  salvarPassageiros,
  type IntegrationOrder,
} from "./store.server";

export type PassageiroEntrada = Parameters<typeof salvarPassageiros>[1][number];

/**
 * Registra uma reserva paga em Pix: guarda a compra e os passageiros,
 * deixa o pedido em PIX_MANUAL_PREPARATION e avisa a equipe pelo painel.
 */
export async function registrarReservaPix(input: {
  viaairOrderId?: string | null;
  productKind?: string | null;
  offer: Record<string, unknown>;
  searchReference?: Record<string, unknown>;
  amount: number;
  commissionAmount?: number | null;
  currency?: string;
  customerName?: string | null;
  customerEmail?: string | null;
  passageiros?: PassageiroEntrada[];
}): Promise<IntegrationOrder> {
  const op = await criarOperacao({
    viaairOrderId: input.viaairOrderId ?? null,
    productKind: input.productKind ?? null,
    offer: input.offer,
    searchReference: input.searchReference ?? {},
    amount: input.amount,
    commissionAmount: input.commissionAmount ?? null,
    currency: input.currency ?? "BRL",
    customerName: input.customerName ?? null,
    customerEmail: input.customerEmail ?? null,
    paymentMethod: "PIX",
  });

  if (input.passageiros?.length) await salvarPassageiros(op.id, input.passageiros);

  await registrarEvento({
    integrationOrderId: op.id,
    eventType: "pix_manual_task_open",
    state: "PIX_MANUAL_PREPARATION",
    message: "Tarefa aberta: reserva Pix aguardando preparação manual na Comprar Viagem",
  });

  return op;
}

/** Quantas reservas Pix estão esperando a equipe. Serve de aviso no painel. */
export async function contarTarefasPix(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("integration_orders")
    .select("id", { count: "exact", head: true })
    .eq("provider", "oner")
    .eq("payment_method", "PIX")
    .eq("state", "PIX_MANUAL_PREPARATION");
  return count ?? 0;
}

export type TarefaPix = {
  operacao: IntegrationOrder;
  passageiros: Awaited<ReturnType<typeof listarPassageiros>>;
  bilhetes: Awaited<ReturnType<typeof listarBilhetes>>;
  etapas: Array<{ chave: OnerPixStep; feito: boolean; em: string | null; por: string | null }>;
};

/** Tudo que a equipe precisa ver para refazer a oferta na Comprar Viagem. */
export async function detalharTarefaPix(id: string): Promise<TarefaPix | null> {
  const operacao = await buscarOperacao(id);
  if (!operacao) return null;
  const lista = operacao.manual_checklist ?? {};
  return {
    operacao,
    passageiros: await listarPassageiros(id),
    bilhetes: await listarBilhetes(id),
    etapas: ONER_PIX_STEPS.map((chave) => ({
      chave,
      feito: Boolean(lista[chave]?.feito),
      em: lista[chave]?.em ?? null,
      por: lista[chave]?.por ?? null,
    })),
  };
}

export async function listarTarefasPix(limite = 100): Promise<IntegrationOrder[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("integration_orders")
    .select("*")
    .eq("provider", "oner")
    .eq("payment_method", "PIX")
    .order("created_at", { ascending: false })
    .limit(limite);
  return (data as unknown as IntegrationOrder[]) ?? [];
}

/** Marca uma etapa da operação manual. */
export async function marcarEtapaPix(
  id: string,
  etapa: OnerPixStep,
  feito: boolean,
  autor?: string | null,
) {
  return marcarEtapaManual(id, etapa, feito, autor);
}

/**
 * Grava os dados que a equipe coletou na Comprar Viagem
 * (valor líquido, pedido F-…, Pix, localizador, observações).
 */
export async function registrarDadosPix(
  id: string,
  dados: {
    valorLiquido?: number | null;
    numeroPedido?: string | null;
    brcode?: string | null;
    localizador?: string | null;
    observacoes?: string | null;
  },
) {
  const patch: Record<string, unknown> = {};
  if (dados.valorLiquido != null) patch["provider_net_amount"] = dados.valorLiquido;
  if (dados.numeroPedido) patch["provider_order_number"] = dados.numeroPedido.trim().toUpperCase();
  if (dados.brcode) patch["provider_pix_brcode"] = dados.brcode.trim();
  if (dados.localizador) patch["locator"] = dados.localizador.trim().toUpperCase();
  if (dados.observacoes != null) patch["manual_notes"] = dados.observacoes;
  if (!Object.keys(patch).length) return buscarOperacao(id);
  return atualizarOperacao(id, patch, {
    eventType: "pix_manual_data",
    message: "Dados da operação manual atualizados",
    payload: { campos: Object.keys(patch) },
  });
}

/** Fecha a tarefa Pix depois que a reserva foi confirmada. */
export async function concluirTarefaPix(id: string, autor?: string | null) {
  await marcarEtapaManual(id, "booking_confirmed", true, autor);
  return atualizarOperacao(
    id,
    { state: "COMPLETE", state_detail: "Pix preparado manualmente e reserva confirmada" },
    { eventType: "pix_manual_done", message: "Reserva Pix concluída pela equipe" },
  );
}
