/**
 * Envio Lovable → n8n. SERVER-ONLY.
 *
 * ATENÇÃO: nada aqui está ligado ao atendimento. O dispatcher atual continua
 * chamando runAgent(). Esta função só entra em uso quando
 * N8N_AGENT_ENABLED=true (feature flag) — e mesmo assim, quem chama decide.
 *
 * A chamada é "fire-and-accept": o n8n responde rápido (evento aceito) e
 * devolve o conteúdo depois, por callback, para não prender um Worker durante
 * pesquisas de voo que levam dezenas de segundos.
 */
import { buildN8nAgentContext } from "./context.server";
import { isN8nAgentEnabled, n8nSecret, n8nWebhookUrl, signPayload } from "./config.server";
import { finishRun, startRun } from "./runs.server";

export type DispatchResult =
  | { ok: true; runId: string; accepted: true; n8nExecutionId: string | null }
  | { ok: false; reason: string; runId?: string };

const TIMEOUT_MS = 10_000; // só o "aceite"; o trabalho real volta por callback

export async function dispatchTurnToN8n(input: {
  conversationId: string;
  messageId?: string | null;
  channel?: string;
  /** Permite testar sem a flag global (uso em teste controlado/admin). */
  force?: boolean;
}): Promise<DispatchResult> {
  if (!input.force && !isN8nAgentEnabled()) {
    return { ok: false, reason: "n8n_agent_disabled" };
  }
  const url = n8nWebhookUrl();
  const secret = n8nSecret();
  if (!url || !secret) return { ok: false, reason: "n8n_not_configured" };

  const runId = crypto.randomUUID();
  const context = await buildN8nAgentContext(input.conversationId, input.messageId ?? null, {
    runId,
    channel: input.channel,
  });

  await startRun({
    runId,
    conversationId: input.conversationId,
    protocolId: context.protocol_id,
    messageId: context.message_id,
    agentSlug: context.agent?.slug ?? null,
    agentRole: context.agent?.role ?? null,
    channel: context.channel,
  });

  const body = JSON.stringify(context);
  const timestamp = String(Date.now());
  const signature = signPayload(body, timestamp, secret);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-viaair-timestamp": timestamp,
        "x-viaair-signature": signature,
        "x-viaair-run-id": runId,
        "x-viaair-message-id": context.message_id ?? "",
        "idempotency-key": `${input.conversationId}:${context.message_id ?? runId}`,
      },
      body,
      signal: controller.signal,
    });
    const texto = await res.text();
    if (!res.ok) {
      await finishRun(runId, { status: "failed", error: `HTTP ${res.status}: ${texto.slice(0, 300)}` });
      return { ok: false, reason: `n8n_http_${res.status}`, runId };
    }
    let execId: string | null = null;
    try {
      const j = JSON.parse(texto) as Record<string, unknown>;
      execId = (j["executionId"] as string) ?? (j["execution_id"] as string) ?? null;
    } catch {
      execId = null;
    }
    await finishRun(runId, { status: "dispatched", n8nExecutionId: execId });
    return { ok: true, runId, accepted: true, n8nExecutionId: execId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(runId, { status: "failed", error: msg });
    return { ok: false, reason: msg, runId };
  } finally {
    clearTimeout(t);
  }
}
