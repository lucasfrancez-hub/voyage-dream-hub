/**
 * buildN8nAgentContext — monta TUDO que o n8n precisa para decidir a próxima
 * ação de um turno. SERVER-ONLY.
 *
 * Nunca inclui: service role, token da Internal API, credenciais Oner/Asaas/
 * Meta/UazAPI, cookies, OTP, PAN/CVV ou qualquer segredo.
 */
import { toAgentProfile, type AiAgentRow, type N8nAgentProfile } from "./agent-profile";
import { rulesForRole, RULES_VERSION } from "./conversation-rules";
import { loadAgentState } from "./state.server";
import type { AgentState } from "./state";

const HISTORY_LIMIT = 10; // 8–12 mensagens: só o que é realmente relevante
const MAX_CONTENT = 600;

export type N8nHistoryItem = {
  role: "user" | "assistant" | "system";
  sender: string | null;
  content: string;
  summarized: boolean;
  created_at: string;
};

export type N8nAgentContext = {
  event: "message.inbound";
  run_id: string;
  conversation_id: string;
  protocol_id: string | null;
  protocol_number: string | null;
  message_id: string | null;
  channel: string;
  message: { type: string; content: string; created_at: string | null };
  customer: {
    person_id: string | null;
    name: string | null;
    phone: string | null;
    identity_verified: boolean;
  };
  agent: N8nAgentProfile | null;
  handoff: {
    from: string | null;
    to: string | null;
    reason: string | null;
    brief: Record<string, unknown> | null;
  } | null;
  state: AgentState;
  history: N8nHistoryItem[];
  previous_context: string | null;
  rules: ReturnType<typeof rulesForRole> | null;
  runtime: {
    mode: string;
    ai_paused: boolean;
    human_takeover: boolean;
    fraud_blocked: boolean;
    priority: string;
    funnel_stage: string | null;
    supervisor_instruction: string | null;
  };
  metadata: { timezone: string; sent_at: string; rules_version: string };
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Cards e blocos de sistema muito longos viram resumo — o dado real está no state. */
function compactar(row: {
  content: string;
  message_type?: string | null;
  quote_id?: string | null;
  option_index?: number | null;
}): { content: string; summarized: boolean } {
  const tipo = row.message_type ?? "text";
  const texto = row.content ?? "";
  if (tipo === "card" || (row.quote_id && texto.length > 240)) {
    return {
      content: `[card de opção de voo${row.option_index ? ` · opção ${row.option_index}` : ""}${
        row.quote_id ? ` · cotação ${row.quote_id}` : ""
      } — detalhes no estado estruturado]`,
      summarized: true,
    };
  }
  if (texto.length > MAX_CONTENT) {
    return { content: `${texto.slice(0, MAX_CONTENT)}… [truncado]`, summarized: true };
  }
  return { content: texto, summarized: false };
}

export async function buildN8nAgentContext(
  conversationId: string,
  messageId?: string | null,
  opts?: { runId?: string; channel?: string },
): Promise<N8nAgentContext> {
  const supabase = await db();

  const { data: convRow } = await supabase
    .from("wa_conversations")
    .select(
      "id, wa_phone, display_name, person_id, mode, ai_paused, assigned_to, priority, funnel_stage, agent_slug, central_slug, central_brief, protocolo_ativo_id, identity_verified_at, ai_instruction, fraud_transfer_required, fraud_risk_level, meta",
    )
    .eq("id", conversationId)
    .maybeSingle();
  const conv = (convRow ?? {}) as Record<string, unknown>;

  const protocoloId = (conv["protocolo_ativo_id"] as string | null) ?? null;
  let protocoloNumero: string | null = null;
  let openedAt: string | null = null;
  if (protocoloId) {
    const { data: proto } = await supabase
      .from("wa_protocolos")
      .select("numero, opened_at")
      .eq("id", protocoloId)
      .maybeSingle();
    protocoloNumero = (proto as { numero?: string } | null)?.numero ?? null;
    openedAt = (proto as { opened_at?: string } | null)?.opened_at ?? null;
  }

  /* ---------------- agente atribuído (fonte da verdade: ai_agents) -------- */
  const slugAtivo = (conv["central_slug"] as string | null) ?? (conv["agent_slug"] as string | null) ?? null;
  let agent: N8nAgentProfile | null = null;
  if (slugAtivo) {
    const { data: ag } = await supabase
      .from("ai_agents")
      .select("id, slug, nome, equipe, tom_voz, tools_habilitadas, temas_proibidos")
      .eq("slug", slugAtivo)
      .maybeSingle();
    if (ag) agent = toAgentProfile(ag as unknown as AiAgentRow);
  }

  /* ---------------- mensagem do turno ------------------------------------ */
  let msg: { type: string; content: string; created_at: string | null } = {
    type: "text",
    content: "",
    created_at: null,
  };
  if (messageId) {
    const { data: m } = await supabase
      .from("wa_messages")
      .select("content, message_type, transcricao, created_at")
      .eq("id", messageId)
      .maybeSingle();
    const row = m as { content?: string; message_type?: string | null; transcricao?: string | null; created_at?: string } | null;
    if (row) {
      msg = {
        type: row.message_type ?? "text",
        content: (row.transcricao?.trim() || row.content || "").slice(0, 4000),
        created_at: row.created_at ?? null,
      };
    }
  }

  /* ---------------- histórico curto -------------------------------------- */
  let q = supabase
    .from("wa_messages")
    .select("direction, sender, content, message_type, quote_id, option_index, transcricao, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (openedAt) q = q.gte("created_at", openedAt);
  const { data: msgs } = await q;
  const history: N8nHistoryItem[] = ((msgs ?? []) as Array<Record<string, unknown>>)
    .slice()
    .reverse()
    .map((r) => {
      const compact = compactar({
        content: (r["transcricao"] as string | null)?.trim() || String(r["content"] ?? ""),
        message_type: r["message_type"] as string | null,
        quote_id: r["quote_id"] as string | null,
        option_index: r["option_index"] as number | null,
      });
      const direction = String(r["direction"] ?? "inbound");
      return {
        role: direction === "inbound" ? "user" : "assistant",
        sender: (r["sender"] as string | null) ?? null,
        content: compact.content,
        summarized: compact.summarized,
        created_at: String(r["created_at"] ?? ""),
      };
    });

  /* ---------------- contexto de protocolos anteriores (condicional) ------- */
  let previousContext: string | null = null;
  try {
    const { shouldLoadPreviousContext } = await import("@/lib/whatsapp/history-reference");
    if (shouldLoadPreviousContext({ lastCustomerText: msg.content })) {
      const { data: antigos } = await supabase
        .from("wa_protocolos")
        .select("numero, assunto_resumo, resumo_conversa, closed_at")
        .eq("conversation_id", conversationId)
        .eq("status", "encerrado_inatividade")
        .order("closed_at", { ascending: false })
        .limit(3);
      const blocos = ((antigos ?? []) as Array<Record<string, unknown>>)
        .map((p) =>
          [p["numero"] ? `Protocolo ${p["numero"]}` : null, p["assunto_resumo"], p["resumo_conversa"]]
            .filter(Boolean)
            .join(" — "),
        )
        .filter(Boolean);
      previousContext = blocos.length ? blocos.join("\n").slice(0, 3000) : null;
    }
  } catch {
    previousContext = null;
  }

  /* ---------------- transferência entre agentes -------------------------- */
  let handoff: N8nAgentContext["handoff"] = null;
  try {
    let hq = supabase
      .from("wa_handoff_events")
      .select("from_mode, to_mode, reason, briefing, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (openedAt) hq = hq.gte("created_at", openedAt);
    const { data: ev } = await hq;
    const row = (ev ?? [])[0] as Record<string, unknown> | undefined;
    if (row) {
      const brief = (conv["central_brief"] as Record<string, unknown> | null) ?? null;
      handoff = {
        from: (row["from_mode"] as string | null) ?? null,
        to: (row["to_mode"] as string | null) ?? agent?.slug ?? null,
        reason: (row["reason"] as string | null) ?? null,
        brief,
      };
    }
  } catch {
    handoff = null;
  }

  const state = await loadAgentState(conversationId);

  const meta = (conv["meta"] as Record<string, unknown> | null) ?? {};
  const channel =
    opts?.channel ?? (typeof meta["channel"] === "string" ? String(meta["channel"]) : "whatsapp_meta");

  return {
    event: "message.inbound",
    run_id: opts?.runId ?? crypto.randomUUID(),
    conversation_id: conversationId,
    protocol_id: protocoloId,
    protocol_number: protocoloNumero,
    message_id: messageId ?? null,
    channel,
    message: msg,
    customer: {
      person_id: (conv["person_id"] as string | null) ?? null,
      name: (conv["display_name"] as string | null) ?? null,
      phone: (conv["wa_phone"] as string | null) ?? null,
      identity_verified: !!conv["identity_verified_at"],
    },
    agent,
    handoff,
    state,
    history,
    previous_context: previousContext,
    rules: agent ? rulesForRole(agent.role) : null,
    runtime: {
      mode: (conv["mode"] as string | null) ?? "ai",
      ai_paused: !!conv["ai_paused"],
      human_takeover: conv["mode"] === "human" && !!conv["assigned_to"],
      fraud_blocked: !!conv["fraud_transfer_required"],
      priority: (conv["priority"] as string | null) ?? "normal",
      funnel_stage: (conv["funnel_stage"] as string | null) ?? null,
      supervisor_instruction: (conv["ai_instruction"] as string | null) ?? null,
    },
    metadata: {
      timezone: "America/Sao_Paulo",
      sent_at: new Date().toISOString(),
      rules_version: RULES_VERSION,
    },
  };
}
