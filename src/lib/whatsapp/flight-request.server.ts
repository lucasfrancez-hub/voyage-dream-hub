/**
 * ESTADO PERSISTIDO DE CADA SOLICITAÇÃO AÉREA (wa_flight_search_requests).
 *
 * Antes, a continuidade da cotação dependia do texto recente da conversa, do
 * central_slug da conversa e de uma única referência no protocolo. Bastava o
 * cliente responder "isso" pra triagem recalcular o produto e devolver o
 * atendimento pras Consultoras.
 *
 * Agora cada pesquisa aérea vive numa linha própria: setor responsável,
 * dados coletados, filtros, pergunta pendente, próxima ação e referências.
 * Duas pesquisas simultâneas (Rio e Paris) coexistem no mesmo protocolo.
 *
 * SERVER-ONLY.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logProtocolEvent } from "./protocol-runtime.server";
import type { FlightRequestPatch, NextAction, PendingQuestion } from "./short-answer";

export type FlightRequestStatus =
  | "collecting"
  | "searching"
  | "delivering"
  | "awaiting_customer"
  | "completed"
  | "cancelled"
  | "transferred";

/** Status em que a solicitação ainda "prende" o setor aéreo. */
export const STATUS_ATIVOS: FlightRequestStatus[] = [
  "collecting",
  "searching",
  "delivering",
  "awaiting_customer",
];

export type FlightSearchRequest = {
  id: string;
  conversation_id: string;
  protocol_id: string | null;
  agent_slug: string | null;
  status: FlightRequestStatus;
  origin: string | null;
  origin_status: string;
  destination: string | null;
  destination_airport: string | null;
  departure_date: string | null;
  return_date: string | null;
  trip_type: string | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  baggage_filter: boolean | null;
  direct_flight_filter: boolean | null;
  max_connections: number | null;
  included_airlines: string[] | null;
  excluded_airlines: string[] | null;
  departure_time_preference: string | null;
  return_time_preference: string | null;
  pending_question: string | null;
  pending_question_message_id: string | null;
  pending_question_context: Record<string, unknown> | null;
  last_customer_message_id: string | null;
  last_processed_message_id: string | null;
  active_quote_id: string | null;
  last_referenced_quote_id: string | null;
  last_referenced_option_index: number | null;
  wait_message_sent_at: string | null;
  last_progress_at: string;
  next_action: string | null;
  failure_reason: string | null;
  customer_nudge_count: number;
  recovery_priority: string;
  recovery_started_at: string | null;
  recovery_attempts: number;
  last_recovery_at: string | null;
  transferred_at: string | null;
  transfer_reason: string | null;
  transfer_briefing: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

const TABELA = "wa_flight_search_requests";

/** Solicitação aérea ativa do protocolo (a mais recente). */
export async function loadActiveFlightRequest(
  protocolId: string | null | undefined,
): Promise<FlightSearchRequest | null> {
  if (!protocolId) return null;
  const { data } = await supabaseAdmin
    .from(TABELA)
    .select("*")
    .eq("protocol_id", protocolId)
    .in("status", STATUS_ATIVOS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FlightSearchRequest | null) ?? null;
}

export async function loadFlightRequest(id: string): Promise<FlightSearchRequest | null> {
  const { data } = await supabaseAdmin.from(TABELA).select("*").eq("id", id).maybeSingle();
  return (data as FlightSearchRequest | null) ?? null;
}

/** Cria a solicitação se ainda não existir uma ativa neste protocolo. */
export async function ensureFlightRequest(params: {
  conversation_id: string;
  protocol_id: string | null;
  agent_slug: string | null;
  seed?: Partial<FlightSearchRequest>;
}): Promise<FlightSearchRequest | null> {
  const atual = await loadActiveFlightRequest(params.protocol_id);
  if (atual) {
    if (params.agent_slug && atual.agent_slug !== params.agent_slug) {
      await updateFlightRequest(atual.id, { agent_slug: params.agent_slug });
      return { ...atual, agent_slug: params.agent_slug };
    }
    return atual;
  }
  const { data, error } = await supabaseAdmin
    .from(TABELA)
    .insert({
      conversation_id: params.conversation_id,
      protocol_id: params.protocol_id,
      agent_slug: params.agent_slug,
      status: "collecting",
      last_progress_at: new Date().toISOString(),
      ...(params.seed ?? {}),
    } as never)
    .select("*")
    .single();
  if (error) {
    console.warn("[flight-request] falha ao criar solicitação:", error.message);
    return null;
  }
  await logProtocolEvent("flight_request_opened", {
    conversation_id: params.conversation_id,
    protocolo_id: params.protocol_id,
    agent_slug: params.agent_slug,
    search_request_id: (data as { id: string }).id,
  });
  return data as FlightSearchRequest;
}

export async function updateFlightRequest(
  id: string,
  patch: Partial<FlightSearchRequest> & FlightRequestPatch,
): Promise<void> {
  const { error } = await supabaseAdmin.from(TABELA).update(patch as never).eq("id", id);
  if (error) console.warn("[flight-request] falha ao atualizar:", error.message);
}

/** Marca progresso real (algo avançou na coleta ou na pesquisa). */
export async function markFlightProgress(
  id: string,
  patch: Partial<FlightSearchRequest> = {},
): Promise<void> {
  await updateFlightRequest(id, {
    ...patch,
    last_progress_at: new Date().toISOString(),
    recovery_priority: "normal",
    recovery_started_at: null,
  } as Partial<FlightSearchRequest>);
}

/** Registra a pergunta que o especialista acabou de fazer. */
export async function setPendingQuestion(params: {
  request_id: string;
  question: PendingQuestion | string;
  context?: Record<string, unknown>;
  message_id?: string | null;
  next_action?: NextAction | null;
}): Promise<void> {
  await updateFlightRequest(params.request_id, {
    pending_question: params.question,
    pending_question_context: (params.context ?? {}) as never,
    pending_question_message_id: params.message_id ?? null,
    next_action: params.next_action ?? null,
    status: "awaiting_customer",
  } as Partial<FlightSearchRequest>);
}

export async function clearPendingQuestion(id: string): Promise<void> {
  await updateFlightRequest(id, {
    pending_question: null,
    pending_question_context: {} as never,
    pending_question_message_id: null,
  } as Partial<FlightSearchRequest>);
}

/** Cobrança do cliente: prioriza a recuperação, sem reiniciar nada. */
export async function registerCustomerNudge(req: FlightSearchRequest): Promise<void> {
  await updateFlightRequest(req.id, {
    customer_nudge_count: (req.customer_nudge_count ?? 0) + 1,
    recovery_priority: "high",
  } as Partial<FlightSearchRequest>);
  await logProtocolEvent("flight_request_nudge", {
    conversation_id: req.conversation_id,
    protocolo_id: req.protocol_id,
    agent_slug: req.agent_slug,
    search_request_id: req.id,
    customer_nudge_count: (req.customer_nudge_count ?? 0) + 1,
  });
}

export async function closeFlightRequest(params: {
  request_id: string;
  status: "completed" | "cancelled" | "transferred";
  reason?: string | null;
}): Promise<void> {
  const agora = new Date().toISOString();
  await updateFlightRequest(params.request_id, {
    status: params.status,
    failure_reason: params.reason ?? null,
    pending_question: null,
    next_action: null,
    completed_at: params.status === "completed" ? agora : null,
    cancelled_at: params.status === "completed" ? null : agora,
  } as Partial<FlightSearchRequest>);
  await logProtocolEvent("flight_request_closed", {
    search_request_id: params.request_id,
    status: params.status,
    reason: params.reason ?? null,
  });
}

/** Encerra qualquer solicitação ativa do protocolo (mudança de necessidade). */
export async function closeActiveFlightRequests(params: {
  protocol_id: string | null;
  status: "completed" | "cancelled" | "transferred";
  reason?: string | null;
}): Promise<void> {
  if (!params.protocol_id) return;
  const agora = new Date().toISOString();
  await supabaseAdmin
    .from(TABELA)
    .update({
      status: params.status,
      failure_reason: params.reason ?? null,
      pending_question: null,
      next_action: null,
      completed_at: params.status === "completed" ? agora : null,
      cancelled_at: params.status === "completed" ? null : agora,
    } as never)
    .eq("protocol_id", params.protocol_id)
    .in("status", STATUS_ATIVOS);
}

/* ── aviso de pesquisa: uma vez por solicitação ─────────────────────────── */

/** true quando o aviso "já vou verificar" ainda não saiu nesta solicitação. */
export function shouldSendWaitMessage(req: FlightSearchRequest | null): boolean {
  if (!req) return true;
  return !req.wait_message_sent_at;
}

export async function markWaitMessageSent(id: string): Promise<void> {
  await updateFlightRequest(id, { wait_message_sent_at: new Date().toISOString() } as Partial<FlightSearchRequest>);
}

/* ── bloco de contexto injetado no prompt ───────────────────────────────── */

const ROTULO_ACAO: Record<string, string> = {
  ask_origin: "perguntar de qual cidade ele embarca",
  ask_destination: "perguntar o destino",
  ask_dates: "perguntar as datas",
  ask_trip_type: "confirmar se é só ida ou ida e volta",
  ask_passengers: "perguntar quantos passageiros",
  run_search: "PESQUISAR AGORA com pesquisar_passagens",
  await_customer: "aguardar a resposta do cliente",
  deliver_options: "entregar as opções pendentes",
};

export function buildFlightRequestBlock(
  req: FlightSearchRequest | null,
  extras?: { resolvido?: string | null; cobranca?: boolean },
): string {
  if (!req) return "";
  const l: string[] = [];
  l.push(`\n\n# ✈️ SOLICITAÇÃO AÉREA ATIVA (estado salvo no servidor — id ${req.id.slice(0, 8)})`);
  l.push(
    `Este atendimento É do setor aéreo e continua com você até a cotação terminar, o cliente desistir ou pedir outro serviço. ` +
      `Mensagens curtas ("isso", "ok", "?", "conseguiu?") fazem parte DESTA cotação — nunca reinicie o atendimento nem se apresente de novo.`,
  );
  const dados: string[] = [];
  if (req.origin) dados.push(`- Origem: ${req.origin}${req.origin_status === "confirmed_by_customer" ? " (confirmada pelo cliente)" : ""}`);
  else dados.push(`- Origem: ainda não informada pelo cliente (pergunte, nunca presuma)`);
  if (req.destination) dados.push(`- Destino: ${req.destination}`);
  if (req.trip_type) dados.push(`- Trecho: ${req.trip_type === "round_trip" ? "ida e volta" : "somente ida"}`);
  if (req.departure_date) dados.push(`- Ida: ${req.departure_date}`);
  if (req.return_date) dados.push(`- Volta: ${req.return_date}`);
  if (req.adults != null) dados.push(`- Adultos: ${req.adults}`);
  if (req.children) dados.push(`- Crianças: ${req.children}`);
  if (req.infants) dados.push(`- Bebês: ${req.infants}`);
  if (req.baggage_filter != null) dados.push(`- Bagagem despachada: ${req.baggage_filter ? "sim" : "não"}`);
  if (req.direct_flight_filter != null) dados.push(`- Voo direto: ${req.direct_flight_filter ? "sim" : "não"}`);
  if (req.included_airlines?.length) dados.push(`- Só companhias: ${req.included_airlines.join(", ")}`);
  if (req.excluded_airlines?.length) dados.push(`- Sem companhias: ${req.excluded_airlines.join(", ")}`);
  l.push(`Dados já coletados NESTA solicitação:\n${dados.join("\n")}`);

  if (extras?.resolvido) {
    l.push(`✅ Já resolvido pelo servidor agora: ${extras.resolvido}. NÃO pergunte isso de novo.`);
  }
  if (req.pending_question && !extras?.resolvido) {
    l.push(`❓ Pergunta pendente: ${req.pending_question}. A resposta do cliente se refere a ela.`);
  }
  if (req.next_action) {
    l.push(`➡️ Próximo passo: ${ROTULO_ACAO[req.next_action] ?? req.next_action}.`);
  }
  if (extras?.cobranca) {
    l.push(
      `⏳ O cliente está COBRANDO retorno. Não recomece a pesquisa nem repita a promessa de "já vou verificar": ` +
        `diga em uma frase curta onde está a cotação e entregue o que já tem. Se nada saiu ainda, seja direto e honesto.`,
    );
  }
  return l.join("\n");
}
