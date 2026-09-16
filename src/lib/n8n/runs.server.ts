/**
 * Registro dos turnos enviados ao n8n (tabela n8n_agent_runs). SERVER-ONLY.
 * Permite descobrir exatamente por que uma resposta deu errado.
 */
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type N8nRunStatus = "pending" | "dispatched" | "processing" | "completed" | "failed" | "rejected" | "expired";

export async function startRun(input: {
  runId: string;
  conversationId: string;
  protocolId: string | null;
  messageId: string | null;
  agentSlug: string | null;
  agentRole: string | null;
  channel: string;
}): Promise<void> {
  const supabase = await db();
  await supabase.from("n8n_agent_runs").insert({
    run_id: input.runId,
    conversation_id: input.conversationId,
    protocol_id: input.protocolId,
    message_id: input.messageId,
    agent_slug: input.agentSlug,
    agent_role: input.agentRole,
    channel: input.channel,
    status: "pending",
  } as never);
}

/**
 * O n8n aceitou o evento (202). O run continua ABERTO aguardando o callback —
 * por isso não gravamos finished_at/duration aqui.
 */
export async function markDispatched(runId: string, n8nExecutionId: string | null): Promise<void> {
  const supabase = await db();
  await supabase
    .from("n8n_agent_runs")
    .update({ status: "dispatched", n8n_execution_id: n8nExecutionId } as never)
    .eq("run_id", runId)
    // Só promove runs ainda "pending": nunca desfaz um callback que já assumiu o run.
    .eq("status", "pending");
}

export async function finishRun(
  runId: string,
  patch: {
    status: N8nRunStatus;
    n8nExecutionId?: string | null;
    actions?: unknown;
    stateUpdate?: unknown;
    error?: string | null;
  },
): Promise<void> {
  const supabase = await db();
  const { data } = await supabase.from("n8n_agent_runs").select("started_at").eq("run_id", runId).maybeSingle();
  const startedAt = (data as { started_at?: string } | null)?.started_at;
  const finished = new Date();
  await supabase
    .from("n8n_agent_runs")
    .update({
      status: patch.status,
      finished_at: finished.toISOString(),
      duration_ms: startedAt ? finished.getTime() - new Date(startedAt).getTime() : null,
      n8n_execution_id: patch.n8nExecutionId ?? null,
      actions: (patch.actions ?? []) as never,
      state_update: (patch.stateUpdate ?? null) as never,
      error: patch.error ?? null,
    } as never)
    .eq("run_id", runId);
}

/** Run válido = existe, é desta conversa e ainda não foi concluído. */
export async function loadRun(runId: string): Promise<{
  run_id: string;
  conversation_id: string;
  protocol_id: string | null;
  message_id: string | null;
  agent_slug: string | null;
  status: string;
  started_at: string;
} | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("n8n_agent_runs")
    .select("run_id, conversation_id, protocol_id, message_id, agent_slug, status, started_at")
    .eq("run_id", runId)
    .maybeSingle();
  return (data as never) ?? null;
}

/**
 * Transição ATÔMICA de status: só altera se o status atual estiver em `from`.
 * Devolve true se ESTA chamada fez a transição (quem perde a corrida recebe false).
 * É a base da proteção contra duplicidade entre dispatch, callback e watchdog.
 */
export async function transitionRun(
  runId: string,
  from: N8nRunStatus[],
  to: N8nRunStatus,
  error?: string | null,
  extra?: { n8nExecutionId?: string | null },
): Promise<boolean> {
  const supabase = await db();
  const patch: Record<string, unknown> = { status: to };
  if (error !== undefined) patch["error"] = error;
  if (extra?.n8nExecutionId !== undefined) patch["n8n_execution_id"] = extra.n8nExecutionId;
  if (to === "completed" || to === "failed" || to === "rejected" || to === "expired") {
    patch["finished_at"] = new Date().toISOString();
  }
  const { data, error: err } = await supabase
    .from("n8n_agent_runs")
    .update(patch as never)
    .eq("run_id", runId)
    .in("status", from)
    .select("run_id");
  if (err) {
    console.error("[n8n/runs] transitionRun", runId, err.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/** Existe turno em andamento no n8n para esta conversa? */
export async function hasOpenRun(conversationId: string): Promise<boolean> {
  const supabase = await db();
  const { data } = await supabase
    .from("n8n_agent_runs")
    .select("run_id")
    .eq("conversation_id", conversationId)
    .in("status", ["pending", "dispatched", "processing"])
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/** Runs ainda abertos (pending/dispatched/processing) iniciados há mais de `olderThanMs`. */
export async function listStaleOpenRuns(
  olderThanMs: number,
  limit = 50,
): Promise<{ run_id: string; conversation_id: string; status: string; started_at: string }[]> {
  const supabase = await db();
  const limite = new Date(Date.now() - olderThanMs).toISOString();
  const { data, error } = await supabase
    .from("n8n_agent_runs")
    .select("run_id, conversation_id, status, started_at")
    .in("status", ["pending", "dispatched", "processing"])
    .lt("started_at", limite)
    .order("started_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[n8n/runs] listStaleOpenRuns", error.message);
    return [];
  }
  return (data ?? []) as { run_id: string; conversation_id: string; status: string; started_at: string }[];
}
