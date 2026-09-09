/**
 * Persistência da integração Comprar Viagem / Oner.
 * Todo passo importante vira linha em `integration_orders` + `integration_events`.
 * SERVER-ONLY.
 */
import {
  ONER_PROVIDER,
  proximoIntervaloSegundos,
  type OnerPaymentMethod,
  type OnerPixStep,
  type OnerState,
} from "./config";

/** Marca de uma etapa da lista de conferência do Pix manual. */
export type MarcaEtapaManual = {
  feito: boolean;
  em?: string | null;
  por?: string | null;
  observacao?: string | null;
};

export type IntegrationOrder = {
  id: string;
  viaair_order_id: string | null;
  provider: string;
  product_kind: string | null;
  offer_payload: Record<string, unknown>;
  provider_cart_id: string | null;
  provider_order_number: string | null;
  provider_sale_id: string | null;
  provider_booking_id: string | null;
  provider_status: string | null;
  state: OnerState;
  state_detail: string | null;
  amount: number | null;
  amount_provider: number | null;
  currency: string;
  payment_method: OnerPaymentMethod;
  commission_amount: number | null;
  provider_net_amount: number | null;
  search_reference: Record<string, unknown>;
  manual_checklist: Partial<Record<OnerPixStep, MarcaEtapaManual>>;
  manual_notes: string | null;
  manual_owner_user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_payment_id: string | null;
  customer_payment_status: string | null;
  customer_payment_txid: string | null;
  provider_payment_id: string | null;
  provider_payment_status: string | null;
  provider_pix_brcode: string | null;
  provider_pix_payload: Record<string, unknown> | null;
  provider_pix_idempotency_key: string | null;
  locator: string | null;
  hotel_locator: string | null;
  sale_detail: Record<string, unknown> | null;
  last_error: string | null;
  attempts: number;
  next_poll_at: string | null;
  poll_count: number;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};


async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Grava um passo no histórico. Nunca receba segredo aqui. */
export async function registrarEvento(args: {
  integrationOrderId?: string | null;
  eventType: string;
  state?: OnerState | null;
  message?: string | null;
  payload?: unknown;
}) {
  const db = await admin();
  await db.from("integration_events").insert({
    integration_order_id: args.integrationOrderId ?? null,
    provider: ONER_PROVIDER,
    event_type: args.eventType,
    state: args.state ?? null,
    message: args.message ?? null,
    payload: (args.payload ?? null) as never,
  } as never);
}

export async function criarOperacao(input: {
  viaairOrderId?: string | null;
  productKind?: string | null;
  offer: Record<string, unknown>;
  amount?: number | null;
  currency?: string;
  customerName?: string | null;
  customerEmail?: string | null;
  cartId?: string | null;
  /** CARD segue automático; PIX nasce como tarefa manual da equipe. */
  paymentMethod?: OnerPaymentMethod;
  /** Comissão original da oferta. Nunca é zerada em cartão. */
  commissionAmount?: number | null;
  /** IDs/referências da busca original, para a equipe refazer a oferta. */
  searchReference?: Record<string, unknown>;
  state?: OnerState;
}): Promise<IntegrationOrder> {
  const db = await admin();
  const metodo: OnerPaymentMethod = input.paymentMethod ?? "CARD";
  const estado: OnerState = input.state ?? (metodo === "PIX" ? "PIX_MANUAL_PREPARATION" : "CART_CREATED");
  const { data, error } = await db
    .from("integration_orders")
    .insert({
      viaair_order_id: input.viaairOrderId ?? null,
      provider: ONER_PROVIDER,
      product_kind: input.productKind ?? null,
      offer_payload: input.offer as never,
      provider_cart_id: input.cartId ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? "BRL",
      customer_name: input.customerName ?? null,
      customer_email: input.customerEmail ?? null,
      payment_method: metodo,
      commission_amount: input.commissionAmount ?? null,
      search_reference: (input.searchReference ?? {}) as never,
      state: estado,
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(`Não foi possível guardar a operação: ${error.message}`);
  const row = data as unknown as IntegrationOrder;
  await registrarEvento({
    integrationOrderId: row.id,
    eventType: metodo === "PIX" ? "pix_manual_created" : "cart_created",
    state: estado,
    message:
      metodo === "PIX"
        ? "Reserva Pix registrada — aguardando preparação manual na Comprar Viagem"
        : "Oferta guardada no carrinho VIA AIR",
  });
  return row;
}

/**
 * Marca (ou desmarca) uma etapa da lista de conferência do Pix manual,
 * guardando quem fez e quando. O histórico registra cada mudança.
 */
export async function marcarEtapaManual(
  id: string,
  etapa: OnerPixStep,
  feito: boolean,
  autor?: string | null,
  observacao?: string | null,
): Promise<IntegrationOrder | null> {
  const op = await buscarOperacao(id);
  if (!op) return null;
  const lista = { ...(op.manual_checklist ?? {}) };
  lista[etapa] = {
    feito,
    em: feito ? new Date().toISOString() : null,
    por: feito ? (autor ?? null) : null,
    observacao: observacao ?? null,
  };
  return atualizarOperacao(
    id,
    { manual_checklist: lista },
    {
      eventType: "pix_manual_step",
      message: `${etapa} → ${feito ? "concluído" : "reaberto"}`,
      payload: { etapa, feito },
    },
  );
}


export async function buscarOperacao(id: string): Promise<IntegrationOrder | null> {
  const db = await admin();
  const { data } = await db.from("integration_orders").select("*").eq("id", id).maybeSingle();
  return (data as unknown as IntegrationOrder) ?? null;
}

export async function buscarPorNumeroPedido(numero: string): Promise<IntegrationOrder | null> {
  const db = await admin();
  const { data } = await db
    .from("integration_orders")
    .select("*")
    .eq("provider", ONER_PROVIDER)
    .eq("provider_order_number", numero)
    .maybeSingle();
  return (data as unknown as IntegrationOrder) ?? null;
}

/** Atualiza campos e (opcionalmente) muda a etapa, sempre com histórico. */
export async function atualizarOperacao(
  id: string,
  patch: Partial<Record<keyof IntegrationOrder, unknown>>,
  evento?: { eventType: string; message?: string | null; payload?: unknown },
): Promise<IntegrationOrder | null> {
  const db = await admin();
  const { data, error } = await db
    .from("integration_orders")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Não foi possível atualizar a operação: ${error.message}`);
  const row = (data as unknown as IntegrationOrder) ?? null;
  if (evento) {
    await registrarEvento({
      integrationOrderId: id,
      eventType: evento.eventType,
      state: (patch.state as OnerState | undefined) ?? row?.state ?? null,
      message: evento.message ?? null,
      payload: evento.payload,
    });
  }
  return row;
}

export async function mudarEtapa(
  id: string,
  state: OnerState,
  opts: { detail?: string | null; erro?: string | null; extra?: Record<string, unknown> } = {},
) {
  return atualizarOperacao(
    id,
    {
      state,
      state_detail: opts.detail ?? null,
      last_error: opts.erro ?? null,
      ...(opts.extra ?? {}),
    },
    { eventType: "state_change", message: opts.detail ?? state },
  );
}

/** Reagenda a próxima consulta com intervalo crescente. */
export async function agendarProximaConsulta(op: IntegrationOrder) {
  const segundos = proximoIntervaloSegundos(op.poll_count);
  return atualizarOperacao(op.id, {
    poll_count: op.poll_count + 1,
    next_poll_at: new Date(Date.now() + segundos * 1000).toISOString(),
    last_sync_at: new Date().toISOString(),
  });
}

/** Operações que ainda não terminaram e já podem ser consultadas. */
export async function operacoesPendentes(limite = 20): Promise<IntegrationOrder[]> {
  const db = await admin();
  const agora = new Date().toISOString();
  const { data } = await db
    .from("integration_orders")
    .select("*")
    .eq("provider", ONER_PROVIDER)
    .not("state", "in", "(COMPLETE,CANCELLED,MANUAL_REVIEW,FAILED)")
    .or(`next_poll_at.is.null,next_poll_at.lte.${agora}`)
    .order("updated_at", { ascending: true })
    .limit(limite);
  return (data as unknown as IntegrationOrder[]) ?? [];
}

export async function salvarPassageiros(
  integrationOrderId: string,
  passageiros: Array<{
    passengerType?: string;
    firstName: string;
    lastName: string;
    documentNumber?: string | null;
    documentType?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    nationality?: string | null;
    email?: string | null;
    phone?: string | null;
    extra?: Record<string, unknown>;
  }>,
) {
  const db = await admin();
  await db.from("integration_passengers").delete().eq("integration_order_id", integrationOrderId);
  if (!passageiros.length) return [];
  const { data, error } = await db
    .from("integration_passengers")
    .insert(
      passageiros.map((p) => ({
        integration_order_id: integrationOrderId,
        passenger_type: p.passengerType ?? "ADT",
        first_name: p.firstName,
        last_name: p.lastName,
        document_number: p.documentNumber ?? null,
        document_type: p.documentType ?? null,
        birth_date: p.birthDate ?? null,
        gender: p.gender ?? null,
        nationality: p.nationality ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        extra: (p.extra ?? {}) as never,
      })) as never,
    )
    .select("*");
  if (error) throw new Error(`Não foi possível guardar os passageiros: ${error.message}`);
  await registrarEvento({
    integrationOrderId,
    eventType: "passengers_saved",
    message: `${passageiros.length} passageiro(s) guardado(s)`,
  });
  return data ?? [];
}

export async function listarPassageiros(integrationOrderId: string) {
  const db = await admin();
  const { data } = await db
    .from("integration_passengers")
    .select("*")
    .eq("integration_order_id", integrationOrderId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

/** Grava/atualiza bilhetes sem duplicar (chave: pedido + número do bilhete). */
export async function salvarBilhetes(
  integrationOrderId: string,
  bilhetes: Array<{
    passengerName?: string | null;
    ticketNumber?: string | null;
    pnr?: string | null;
    airline?: string | null;
    status?: string | null;
    extra?: Record<string, unknown>;
  }>,
) {
  if (!bilhetes.length) return;
  const db = await admin();
  for (const b of bilhetes) {
    const existente = b.ticketNumber
      ? await db
          .from("integration_tickets")
          .select("id")
          .eq("integration_order_id", integrationOrderId)
          .eq("ticket_number", b.ticketNumber)
          .maybeSingle()
      : { data: null };
    const payload = {
      integration_order_id: integrationOrderId,
      passenger_name: b.passengerName ?? null,
      ticket_number: b.ticketNumber ?? null,
      pnr: b.pnr ?? null,
      airline: b.airline ?? null,
      status: b.status ?? null,
      extra: (b.extra ?? {}) as never,
    };
    if (existente.data) {
      await db.from("integration_tickets").update(payload as never).eq("id", (existente.data as { id: string }).id);
    } else {
      await db.from("integration_tickets").insert(payload as never);
    }
  }
  await registrarEvento({
    integrationOrderId,
    eventType: "tickets_saved",
    message: `${bilhetes.length} bilhete(s) sincronizado(s)`,
  });
}

export async function listarBilhetes(integrationOrderId: string) {
  const db = await admin();
  const { data } = await db
    .from("integration_tickets")
    .select("*")
    .eq("integration_order_id", integrationOrderId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listarEventos(integrationOrderId: string, limite = 200) {
  const db = await admin();
  const { data } = await db
    .from("integration_events")
    .select("*")
    .eq("integration_order_id", integrationOrderId)
    .order("created_at", { ascending: false })
    .limit(limite);
  return data ?? [];
}
