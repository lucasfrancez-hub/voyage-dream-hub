/**
 * Multitrecho da API interna VIA AIR.
 *
 * Regra herdada do portal (`src/lib/multicity.ts`): multitrecho é composição de
 * pesquisas só-ida, uma por perna, na ordem informada. Aqui apenas agrupamos os
 * checkouts resultantes sob um groupId próprio da VIA AIR — cada perna continua
 * sendo uma reserva independente no fornecedor. SERVER-ONLY.
 */
import { MAX_SEGMENTS, MIN_SEGMENTS } from "@/lib/multicity";

export const MULTICITY_MIN_LEGS = MIN_SEGMENTS;
export const MULTICITY_MAX_LEGS = MAX_SEGMENTS;

export type MulticityLegInput = {
  origin: string;
  destination: string;
  departureDate: string;
};

export type GroupStatus =
  | "CREATED"
  | "PARTIALLY_CREATED"
  | "AWAITING_PAYMENT"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PARTIALLY_ISSUED"
  | "COMPLETE"
  | "MANUAL_REVIEW"
  | "FAILED";

export type GroupItem = {
  sequence: number;
  checkout_id: string | null;
  order_id: string | null;
  origin: string;
  destination: string;
  departure_date: string | null;
  amount: number | null;
  status: string;
  last_error: string | null;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ */
/* Validação das pernas                                                 */
/* ------------------------------------------------------------------ */

/** Devolve a lista de erros (vazia = válido). Mesmas regras do portal. */
export function validarPernas(legs: MulticityLegInput[]): string[] {
  const erros: string[] = [];
  if (legs.length < MULTICITY_MIN_LEGS) {
    erros.push(`Informe pelo menos ${MULTICITY_MIN_LEGS} pernas.`);
  }
  if (legs.length > MULTICITY_MAX_LEGS) {
    erros.push(`O máximo suportado é de ${MULTICITY_MAX_LEGS} pernas.`);
  }
  let anterior = "";
  legs.forEach((l, i) => {
    const n = i + 1;
    const o = (l.origin ?? "").trim().toUpperCase();
    const d = (l.destination ?? "").trim().toUpperCase();
    if (o.length !== 3) erros.push(`legs.${i}.origin: informe o código IATA de 3 letras.`);
    if (d.length !== 3) erros.push(`legs.${i}.destination: informe o código IATA de 3 letras.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.departureDate ?? "")) {
      erros.push(`legs.${i}.departureDate: informe a data no formato AAAA-MM-DD.`);
      return;
    }
    if (o && d && o === d) {
      erros.push(`legs.${i}: origem e destino não podem ser iguais (perna ${n}).`);
    }
    if (anterior && l.departureDate < anterior) {
      erros.push(`legs.${i}.departureDate: a data da perna ${n} não pode ser anterior à da perna ${n - 1}.`);
    }
    anterior = l.departureDate;
  });
  return erros;
}

/* ------------------------------------------------------------------ */
/* Grupo                                                                */
/* ------------------------------------------------------------------ */

export async function criarGrupo(args: {
  groupId: string;
  clientId: string;
  searchId: string;
  status: GroupStatus;
  totalAmount: number;
  itens: Array<Omit<GroupItem, "last_error"> & { last_error?: string | null }>;
}) {
  const supabase = await db();
  await supabase.from("api_multicity_groups").insert({
    group_id: args.groupId,
    api_client_id: args.clientId,
    search_id: args.searchId,
    status: args.status,
    total_amount: args.totalAmount,
    currency: "BRL",
  } as never);
  await supabase.from("api_multicity_group_items").insert(
    args.itens.map((i) => ({
      group_id: args.groupId,
      sequence: i.sequence,
      checkout_id: i.checkout_id,
      order_id: i.order_id,
      origin: i.origin,
      destination: i.destination,
      departure_date: i.departure_date,
      amount: i.amount,
      status: i.status,
      last_error: i.last_error ?? null,
    })) as never,
  );
}

export async function lerGrupo(
  groupId: string,
  clientId?: string,
): Promise<{
  group_id: string;
  api_client_id: string;
  search_id: string;
  status: string;
  total_amount: number;
  currency: string;
  itens: GroupItem[];
} | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_multicity_groups")
    .select("group_id,api_client_id,search_id,status,total_amount,currency")
    .eq("group_id", groupId)
    .maybeSingle();
  const g = data as {
    group_id: string;
    api_client_id: string;
    search_id: string;
    status: string;
    total_amount: number;
    currency: string;
  } | null;
  if (!g) return null;
  if (clientId && g.api_client_id !== clientId) return null;
  const { data: itens } = await supabase
    .from("api_multicity_group_items")
    .select("sequence,checkout_id,order_id,origin,destination,departure_date,amount,status,last_error")
    .eq("group_id", groupId)
    .order("sequence", { ascending: true });
  return { ...g, itens: (itens ?? []) as GroupItem[] };
}

export async function atualizarItem(
  groupId: string,
  sequence: number,
  campos: Partial<Pick<GroupItem, "checkout_id" | "order_id" | "amount" | "status" | "last_error">>,
) {
  const supabase = await db();
  await supabase
    .from("api_multicity_group_items")
    .update(campos as never)
    .eq("group_id", groupId)
    .eq("sequence", sequence);
}

export async function atualizarGrupo(
  groupId: string,
  campos: { status?: GroupStatus; total_amount?: number },
) {
  const supabase = await db();
  await supabase.from("api_multicity_groups").update(campos as never).eq("group_id", groupId);
}

/* ------------------------------------------------------------------ */
/* Situação do grupo                                                    */
/* ------------------------------------------------------------------ */

/**
 * Deriva a situação do conjunto a partir da situação de cada reserva.
 * COMPLETE só quando todas as reservas estiverem concluídas.
 */
export function statusDoGrupo(
  reservas: Array<{ status: string; paymentStatus?: string | null; ticketStatus?: string | null }>,
): GroupStatus {
  if (reservas.length === 0) return "FAILED";
  const falhou = (r: (typeof reservas)[number]) => r.status === "FAILED" || r.status === "DECLINED";
  const emitido = (r: (typeof reservas)[number]) =>
    r.ticketStatus === "ISSUED" || r.status === "COMPLETE" || r.status === "TICKETS_RECEIVED";
  const pago = (r: (typeof reservas)[number]) =>
    r.paymentStatus === "PAID" || emitido(r) || r.status === "CUSTOMER_PAYMENT_PAID";

  if (reservas.some((r) => r.status === "MANUAL_REVIEW")) return "MANUAL_REVIEW";
  if (reservas.every(falhou)) return "FAILED";
  if (reservas.every(emitido)) return "COMPLETE";
  if (reservas.some(emitido)) return "PARTIALLY_ISSUED";
  if (reservas.every(pago)) return "PAID";
  if (reservas.some(pago)) return "PARTIALLY_PAID";
  if (reservas.some(falhou)) return "PARTIALLY_CREATED";
  if (reservas.every((r) => r.checkoutCriado !== false)) return "AWAITING_PAYMENT";
  return "CREATED";
}

/* ------------------------------------------------------------------ */
/* Contexto para os avisos (webhooks)                                   */
/* ------------------------------------------------------------------ */

/** Descobre groupId/sequence de um pedido ou checkout. Nunca lança. */
export async function contextoDeGrupo(args: {
  orderId?: unknown;
  checkoutId?: unknown;
}): Promise<{ groupId: string; sequence: number } | null> {
  try {
    const orderId = typeof args.orderId === "string" ? args.orderId : null;
    const checkoutId = typeof args.checkoutId === "string" ? args.checkoutId : null;
    if (!orderId && !checkoutId) return null;
    const supabase = await db();
    let q = supabase.from("api_multicity_group_items").select("group_id,sequence").limit(1);
    q = orderId ? q.eq("order_id", orderId) : q.eq("checkout_id", checkoutId as string);
    const { data } = await q;
    const row = (data ?? [])[0] as { group_id: string; sequence: number } | undefined;
    return row ? { groupId: row.group_id, sequence: row.sequence } : null;
  } catch {
    return null;
  }
}
