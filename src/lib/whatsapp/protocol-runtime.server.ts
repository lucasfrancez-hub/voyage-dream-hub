/**
 * RUNTIME DO PROTOCOLO — fonte única de verdade operacional do atendimento.
 *
 * Todo estado operacional (agente, prompt, produto, origem, referências)
 * pertence ao PROTOCOLO, nunca à conversa. Ao encerrar um protocolo, esse
 * estado é apagado de forma atômica e nada dele pode reaparecer no próximo.
 *
 * SERVER-ONLY.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MISSING_ORIGIN,
  resolveOriginState,
  originIsUsable,
  type FlightOriginState,
  type OriginStatus,
} from "./flight-origin-state";
import { isValidOriginQuestion } from "./airflow-guard";

/* ── versão realmente executada (item 23 do briefing) ─────────────────── */

export const RUNTIME_BUILD = {
  deployment_id:
    process.env.LOVABLE_DEPLOYMENT_ID ??
    process.env.CF_VERSION_METADATA_ID ??
    process.env.WORKERS_CI_BUILD_UUID ??
    "dev",
  git_commit: process.env.LOVABLE_GIT_COMMIT ?? process.env.CF_PAGES_COMMIT_SHA ?? "unknown",
  build_timestamp: process.env.LOVABLE_BUILD_TIMESTAMP ?? "unknown",
  worker_name: process.env.CF_WORKER_NAME ?? "viaair",
};

/* ── log estruturado + trilha em banco ────────────────────────────────── */

export type ProtocolEvent =
  | "protocol_created"
  | "protocol_closed"
  | "protocol_runtime_reset"
  | "triage_started"
  | "triage_completed"
  | "agent_selected"
  | "prompt_loaded"
  | "agent_prompt_mismatch"
  | "tool_called"
  | "flight_origin_confirmed"
  | "flight_search_blocked"
  | "invalid_airflow_response_blocked"
  | "quote_created"
  | "option_referenced"
  | "option_resent"
  | "pending_ai_run_cancelled"
  | "stale_protocol_job_cancelled"
  | "commercial_handoff"
  | "human_assumed"
  | "message_revoked"
  | "reply_context_not_found"
  | "flight_request_opened"
  | "flight_request_closed"
  | "flight_request_orphan_closed"
  | "flight_request_nudge"
  | "flight_request_answer_resolved"
  | "flight_sector_locked"
  | "flight_turn_recovered"
  | "flight_turn_escalated"
  | "search_promised_without_tool"
  | "transferencia_instabilidade";

export async function logProtocolEvent(
  event: ProtocolEvent,
  fields: {
    conversation_id?: string | null;
    protocolo_id?: string | null;
    trigger_message_id?: string | null;
    agent_slug?: string | null;
    runtime_route?: string | null;
    [k: string]: unknown;
  } = {},
): Promise<void> {
  const {
    conversation_id = null,
    protocolo_id = null,
    trigger_message_id = null,
    agent_slug = null,
    ...payload
  } = fields;
  const line = {
    event,
    conversation_id,
    protocol_id: protocolo_id,
    trigger_message_id,
    agent_slug,
    timestamp: new Date().toISOString(),
    ...RUNTIME_BUILD,
    ...payload,
  };
  console.log("[protocol-event]", JSON.stringify(line));
  try {
    await supabaseAdmin.from("wa_protocol_events").insert({
      conversation_id,
      protocolo_id,
      event,
      agent_slug,
      trigger_message_id,
      deployment_id: RUNTIME_BUILD.deployment_id,
      payload: { ...payload, ...RUNTIME_BUILD },
    });
  } catch (err) {
    console.warn("[protocol-event] falha ao gravar trilha:", err);
  }
}

/* ── leitura/gravação do runtime ──────────────────────────────────────── */

export type ProtocolRuntime = {
  id: string;
  conversation_id: string;
  numero: string;
  status: string;
  opened_at: string;
  agent_slug: string | null;
  agent_name: string | null;
  prompt_type: string | null;
  product_type: string | null;
  origin: string | null;
  origin_status: OriginStatus;
  origin_confirmed_by_message_id: string | null;
  origin_confirmed_at: string | null;
  last_quote_id: string | null;
  last_option_index: number | null;
  last_reference_message_id: string | null;
  last_reference_at: string | null;
};

export async function loadProtocolRuntime(protocolId: string): Promise<ProtocolRuntime | null> {
  const { data } = await supabaseAdmin
    .from("wa_protocolos")
    .select(
      "id, conversation_id, numero, status, opened_at, agent_slug, agent_name, prompt_type, product_type, origin, origin_status, origin_confirmed_by_message_id, origin_confirmed_at, last_quote_id, last_option_index, last_reference_message_id, last_reference_at",
    )
    .eq("id", protocolId)
    .maybeSingle();
  return (data as ProtocolRuntime | null) ?? null;
}

export async function setProtocolRuntime(
  protocolId: string,
  patch: Partial<Omit<ProtocolRuntime, "id" | "conversation_id" | "numero" | "status" | "opened_at">>,
): Promise<void> {
  await supabaseAdmin.from("wa_protocolos").update(patch).eq("id", protocolId).eq("status", "aberto");
}

/** Registra qual agente/prompt/produto está rodando NESTE protocolo. */
export async function bindAgentToProtocol(params: {
  conversation_id: string;
  protocolo_id: string;
  agent_slug: string;
  agent_name: string;
  prompt_type: "central_especialistas" | "consultor";
  product_type: "flight" | "package" | "other";
  trigger_message_id?: string | null;
}): Promise<void> {
  await setProtocolRuntime(params.protocolo_id, {
    agent_slug: params.agent_slug,
    agent_name: params.agent_name,
    prompt_type: params.prompt_type,
    product_type: params.product_type,
  });
  await logProtocolEvent("agent_selected", {
    conversation_id: params.conversation_id,
    protocolo_id: params.protocolo_id,
    trigger_message_id: params.trigger_message_id ?? null,
    agent_slug: params.agent_slug,
    prompt_type: params.prompt_type,
    product_type: params.product_type,
  });
}

/* ── encerramento único e atômico ─────────────────────────────────────── */

export type CloseStatus = "encerrado_manual" | "encerrado_inatividade" | "n";

/**
 * FUNÇÃO CENTRAL DE ENCERRAMENTO. Usada em encerramento manual, automático,
 * por inatividade, pelo atendente e antes de abrir um protocolo novo.
 * A limpeza acontece dentro de uma função do banco (atômica): não existe
 * janela em que o protocolo está fechado mas o agente/prompt/contexto antigo
 * continua ativo.
 */
export async function closeProtocolAndResetRuntime(params: {
  protocolo_id: string;
  status?: CloseStatus;
  reason?: string | null;
}): Promise<{ ok: boolean; conversation_id?: string; closed?: boolean }> {
  const { data, error } = await supabaseAdmin.rpc("close_protocol_and_reset_runtime", {
    p_protocol_id: params.protocolo_id,
    p_status: params.status ?? "encerrado_manual",
    p_reason: params.reason ?? undefined,
  });
  if (error) {
    console.error("[protocol] falha ao encerrar protocolo:", error.message);
    return { ok: false };
  }
  return (data ?? { ok: true }) as { ok: boolean; conversation_id?: string; closed?: boolean };
}

/* ── origem do voo confirmada no servidor ─────────────────────────────── */

export async function loadFlightOriginState(protocolId: string): Promise<FlightOriginState> {
  const rt = await loadProtocolRuntime(protocolId);
  if (!rt) return MISSING_ORIGIN;
  return {
    origin: rt.origin,
    status: (rt.origin_status ?? "missing") as OriginStatus,
    confirmed_by_message_id: rt.origin_confirmed_by_message_id,
    confirmed_at: rt.origin_confirmed_at,
  };
}

/**
 * Verifica NO SERVIDOR se a origem que a IA quer usar foi mesmo informada ou
 * confirmada pelo cliente dentro deste protocolo. Persiste o estado quando sim.
 *
 * Mesmo que a IA mande origem_informada_pelo_cliente = true, sem uma mensagem
 * inbound do protocolo atual o resultado é `missing` e a pesquisa é bloqueada.
 */
export async function confirmFlightOrigin(params: {
  conversation_id: string;
  protocolo_id: string;
  origin: string | null | undefined;
  suggested_origin?: string | null;
}): Promise<FlightOriginState> {
  const { conversation_id, protocolo_id } = params;

  const persisted = await loadFlightOriginState(protocolo_id);
  if (
    originIsUsable(persisted) &&
    (!params.origin ||
      persisted.origin?.trim().toLowerCase() === params.origin.trim().toLowerCase())
  ) {
    return persisted;
  }

  const { data: proto } = await supabaseAdmin
    .from("wa_protocolos")
    .select("opened_at")
    .eq("id", protocolo_id)
    .maybeSingle();
  const desde = (proto as { opened_at?: string } | null)?.opened_at ?? null;

  let inboundQuery = supabaseAdmin
    .from("wa_messages")
    .select("id, content, created_at")
    .eq("conversation_id", conversation_id)
    .eq("protocolo_id", protocolo_id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: true })
    .limit(100);
  if (desde) inboundQuery = inboundQuery.gte("created_at", desde);
  const { data: inbound } = await inboundQuery;

  // Quando NÓS perguntamos a origem neste protocolo (usado pra aceitar "sim").
  const { data: outbound } = await supabaseAdmin
    .from("wa_messages")
    .select("content, created_at")
    .eq("conversation_id", conversation_id)
    .eq("protocolo_id", protocolo_id)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(30);
  const pergunta = ((outbound ?? []) as Array<{ content: string | null; created_at: string }>).find(
    (m) => isValidOriginQuestion(String(m.content ?? ""), params.suggested_origin ?? null),
  );

  // Nome do cliente e do atendente nunca podem virar cidade de embarque
  // (o cliente escreve o vocativo antes do pedido: "Robertp quero passagem...").
  const { data: convRow } = await supabaseAdmin
    .from("wa_conversations")
    .select("display_name, agent_slug, central_slug")
    .eq("id", conversation_id)
    .maybeSingle();

  const state = resolveOriginState({
    origin: params.origin,
    inbound: (inbound ?? []) as Array<{ id: string; content: string | null; created_at: string }>,
    askedOriginAt: pergunta?.created_at ?? null,
    suggestedOrigin: params.suggested_origin ?? null,
    nomesProibidos: [
      (convRow as { display_name?: string | null } | null)?.display_name ?? null,
      (convRow as { agent_slug?: string | null } | null)?.agent_slug ?? null,
      (convRow as { central_slug?: string | null } | null)?.central_slug ?? null,
    ],
  });


  if (originIsUsable(state)) {
    await setProtocolRuntime(protocolo_id, {
      origin: state.origin,
      origin_status: state.status,
      origin_confirmed_by_message_id: state.confirmed_by_message_id,
      origin_confirmed_at: state.confirmed_at,
    });

    // Sincroniza o brief da Central de Especialistas: se o brief dizia
    // "Origem: NÃO informada", ele precisa refletir a origem confirmada
    // para que o especialista não fique com informação contraditória.
    try {
      const { data: conv } = await supabaseAdmin
        .from("wa_conversations")
        .select("central_brief")
        .eq("id", conversation_id)
        .maybeSingle();
      const brief = String((conv as { central_brief?: string | null } | null)?.central_brief ?? "");
      if (brief && /origem:\s*(?:n[aã]o informada|null)/i.test(brief)) {
        const updated = brief.replace(
          /📍\s*Origem:[^\n]*/i,
          `📍 Origem: ${state.origin} — confirmada pelo cliente`,
        );
        if (updated !== brief) {
          await supabaseAdmin
            .from("wa_conversations")
            .update({ central_brief: updated })
            .eq("id", conversation_id);
        }
      }
    } catch (err) {
      console.warn("[protocol-runtime] falha ao sincronizar central_brief:", err);
    }

    await logProtocolEvent("flight_origin_confirmed", {
      conversation_id,
      protocolo_id,
      origin: state.origin,
      origin_status: state.status,
      confirmed_by_message_id: state.confirmed_by_message_id,
    });
  }
  return state;
}

/* ── validade de jobs pendentes ───────────────────────────────────────── */

/**
 * Revalida um job antes de enviar qualquer coisa (texto, 2º card, fallback,
 * reenvio, retry). Nenhuma resposta de protocolo encerrado pode ser enviada
 * num protocolo novo.
 */
export async function isProtocolJobStillValid(params: {
  conversation_id: string;
  protocolo_id: string;
  agent_slug?: string | null;
  trigger_message_id?: string | null;
}): Promise<{ valid: boolean; reason?: string }> {
  const [{ data: conv }, { data: proto }] = await Promise.all([
    supabaseAdmin
      .from("wa_conversations")
      .select("protocolo_ativo_id, mode, ai_paused, agent_slug, central_slug")
      .eq("id", params.conversation_id)
      .maybeSingle(),
    supabaseAdmin
      .from("wa_protocolos")
      .select("id, status, agent_slug")
      .eq("id", params.protocolo_id)
      .maybeSingle(),
  ]);

  if (!proto || (proto as { status: string }).status !== "aberto")
    return { valid: false, reason: "protocolo_encerrado" };
  if ((conv as { protocolo_ativo_id?: string | null } | null)?.protocolo_ativo_id !== params.protocolo_id)
    return { valid: false, reason: "outro_protocolo_ativo" };
  if ((conv as { mode?: string } | null)?.mode !== "ai") return { valid: false, reason: "humano_assumiu" };
  if ((conv as { ai_paused?: boolean } | null)?.ai_paused === true)
    return { valid: false, reason: "ia_pausada" };

  if (params.agent_slug) {
    const atual =
      (conv as { central_slug?: string | null } | null)?.central_slug ??
      (conv as { agent_slug?: string | null } | null)?.agent_slug ??
      null;
    if (atual && atual !== params.agent_slug) return { valid: false, reason: "agente_trocou" };
  }

  if (params.trigger_message_id) {
    const { data: msg } = await supabaseAdmin
      .from("wa_messages")
      .select("protocolo_id")
      .eq("id", params.trigger_message_id)
      .maybeSingle();
    if ((msg as { protocolo_id?: string | null } | null)?.protocolo_id !== params.protocolo_id)
      return { valid: false, reason: "gatilho_de_outro_protocolo" };
  }

  return { valid: true };
}

/** Igual ao anterior, mas já registra o cancelamento quando inválido. */
export async function assertProtocolJobOrCancel(params: {
  conversation_id: string;
  protocolo_id: string;
  agent_slug?: string | null;
  trigger_message_id?: string | null;
  job: string;
}): Promise<boolean> {
  const res = await isProtocolJobStillValid(params);
  if (res.valid) return true;
  await logProtocolEvent("stale_protocol_job_cancelled", {
    conversation_id: params.conversation_id,
    protocolo_id: params.protocolo_id,
    agent_slug: params.agent_slug ?? null,
    trigger_message_id: params.trigger_message_id ?? null,
    job: params.job,
    reason: res.reason,
  });
  return false;
}

/* ── referência da opção citada (item 15) ─────────────────────────────── */

export async function persistProtocolReference(params: {
  conversation_id: string;
  protocolo_id: string;
  quote_id: string | null;
  option_index: number | null;
  reference_message_id?: string | null;
}): Promise<void> {
  await setProtocolRuntime(params.protocolo_id, {
    last_quote_id: params.quote_id,
    last_option_index: params.option_index,
    last_reference_message_id: params.reference_message_id ?? null,
    last_reference_at: new Date().toISOString(),
  });
  await logProtocolEvent("option_referenced", {
    conversation_id: params.conversation_id,
    protocolo_id: params.protocolo_id,
    quote_id: params.quote_id,
    option_index: params.option_index,
  });
}
