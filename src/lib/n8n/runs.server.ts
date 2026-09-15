/**
 * Registro dos turnos enviados ao n8n (tabela n8n_agent_runs). SERVER-ONLY.
 * Permite descobrir exatamente por que uma resposta deu errado.
 */
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type N8nRunStatus = "pending" | "dispatched" | "completed" | "failed" | "rejected";

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
  const { data } = await supabase
    .from("n8n_agent_runs")
    .select("started_at")
    .eq("run_id", runId)
    .maybeSingle();
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
