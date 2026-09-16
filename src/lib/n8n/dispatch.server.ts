/**
 * Envio Lovable → n8n + proteção de falhas do atendimento via n8n. SERVER-ONLY.
 *
 * ATENÇÃO: com N8N_AGENT_ENABLED desligado o atendimento continua 100% no
 * fluxo legado (runAgent). Nada aqui age sobre clientes com a flag desligada.
 *
 * A chamada é "fire-and-accept": o n8n responde rápido (evento aceito) e
 * devolve o conteúdo depois, por callback, para não prender um Worker durante
 * pesquisas de voo que levam dezenas de segundos.
 *
 * Seções deste arquivo:
 *  1. Política de falhas (funções puras, testáveis)
 *  2. dispatchTurnToN8n (envio com retry limitado)
 *  3. Fallback técnico (mensagem fixa + o MESMO handoff da action "handoff")
 *  4. Roteamento do turno (legado / n8n / humano)
 *  5. Processamento do callback (run encerrado, corrida, degraded)
 *  6. Watchdog de runs sem callback (3 min)
 */
import { buildN8nAgentContext } from "./context.server";
import { isN8nAgentEnabled, n8nSecret, n8nWebhookUrl, signPayload } from "./config.server";
import { startRun, transitionRun } from "./runs.server";

// ===========================================================================
// 1. Política de falhas (puro, sem I/O)
//
// - n8n desligado/não configurado → fluxo legado (runAgent) durante a migração.
// - 401/403 (e demais 4xx) → sem retry → fallback humano.
// - 5xx / erro de rede → no máximo 1 retry curto com o MESMO run_id → fallback humano.
// - timeout do aceite → sem retry (o n8n pode ter recebido) → fallback humano.
// - run "pending"/"dispatched" sem callback há mais de 3 min → expira → fallback humano.
// - callback só é aceito para run aberto; runs encerrados nunca voltam a enviar.
// ===========================================================================

export type DispatchFailureKind =
  | "disabled"
  | "not_configured"
  | "auth"
  | "http_4xx"
  | "http_5xx"
  | "timeout"
  | "network";

export type DispatchOutcome =
  | { ok: true; runId: string; accepted: true; n8nExecutionId: string | null; attempts: number }
  | {
      ok: false;
      reason: string;
      kind: DispatchFailureKind;
      runId?: string;
      httpStatus?: number;
      attempts: number;
      /** true quando ESTE fluxo encerrou o run (pending → failed). Só então há fallback. */
      runClosed: boolean;
    };

/** Mensagem fixa enviada ao cliente antes do handoff por falha técnica. */
export const FALLBACK_MESSAGE =
  "Tive uma instabilidade aqui e vou passar seu atendimento para o nosso time continuar com você por aqui.";

/** Watchdog: run aberto sem callback há mais que isso vai para humano. */
export const DISPATCH_WATCHDOG_MS = 3 * 60_000;
/** Callback em "processing" travado há mais que isso é encerrado. */
export const PROCESSING_STUCK_MS = 5 * 60_000;
/** Runs mais antigos que isso só são fechados (sem mensagem/handoff) — evita handoff em massa de lixo antigo. */
export const WATCHDOG_MAX_AGE_MS = 60 * 60_000;
/** Limite técnico máximo para aceitar callback. */
export const CALLBACK_MAX_AGE_MS = 10 * 60_000;
/** Espera antes do único retry permitido. */
export const RETRY_DELAY_MS = 1_500;
/** Tentativas máximas (1 original + 1 retry). */
export const MAX_ATTEMPTS = 2;

/** Status de run que já não aceitam mais nada. */
export const CLOSED_RUN_STATUSES = ["completed", "failed", "rejected", "expired"] as const;
/** Status de run ainda à espera de callback. */
export const OPEN_RUN_STATUSES = ["pending", "dispatched"] as const;

export function classifyHttpStatus(status: number): DispatchFailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "http_5xx";
  return "http_4xx";
}

export function classifyThrown(e: unknown): DispatchFailureKind {
  const name = e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "";
  const msg = e instanceof Error ? e.message : String(e);
  if (name === "AbortError" || name === "TimeoutError" || /abort|timed? ?out/i.test(msg)) return "timeout";
  return "network";
}

/** Só 5xx e erro de rede podem ter 1 retry. Timeout nunca (o n8n pode ter recebido). */
export function isRetryable(kind: DispatchFailureKind): boolean {
  return kind === "http_5xx" || kind === "network";
}

/** Durante a migração, n8n desligado/não configurado usa o fluxo legado. */
export function shouldUseLegacy(outcome: DispatchOutcome): boolean {
  return !outcome.ok && (outcome.kind === "disabled" || outcome.kind === "not_configured");
}

/**
 * Executa as tentativas de envio ao n8n. `attempt` faz UMA chamada e devolve
 * sucesso ou a falha classificada. Nunca passa de MAX_ATTEMPTS.
 */
export async function runDispatchAttempts(
  attempt: (
    n: number,
  ) => Promise<
    | { ok: true; n8nExecutionId: string | null }
    | { ok: false; kind: DispatchFailureKind; httpStatus?: number; reason: string }
  >,
  sleep: (ms: number) => Promise<void>,
): Promise<
  | { ok: true; n8nExecutionId: string | null; attempts: number }
  | { ok: false; kind: DispatchFailureKind; httpStatus?: number; reason: string; attempts: number }
> {
  let last: { ok: false; kind: DispatchFailureKind; httpStatus?: number; reason: string } | null = null;
  let used = 0;
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    used = n;
    const r = await attempt(n);
    if (r.ok) return { ...r, attempts: n };
    last = r;
    if (!isRetryable(r.kind) || n === MAX_ATTEMPTS) break;
    await sleep(RETRY_DELAY_MS);
  }
  return { ...(last as { ok: false; kind: DispatchFailureKind; httpStatus?: number; reason: string }), attempts: used };
}

export type CallbackDecision =
  | { accept: true }
  | { accept: false; httpStatus: number; body: Record<string, unknown>; markRejected?: string };

/** Decide se um callback pode ser processado para o run informado. */
export function callbackDecision(run: { status: string; started_at: string } | null, nowMs: number): CallbackDecision {
  if (!run) return { accept: false, httpStatus: 404, body: { ok: false, error: "run_not_found" } };
  if (run.status === "completed") return { accept: false, httpStatus: 200, body: { ok: true, deduped: true } };
  if ((CLOSED_RUN_STATUSES as readonly string[]).includes(run.status)) {
    return { accept: false, httpStatus: 409, body: { ok: false, error: "run_closed", status: run.status } };
  }
  if (run.status === "processing") {
    return { accept: false, httpStatus: 409, body: { ok: false, error: "run_in_progress" } };
  }
  if (nowMs - new Date(run.started_at).getTime() > CALLBACK_MAX_AGE_MS) {
    return { accept: false, httpStatus: 409, body: { ok: false, error: "run_expired" }, markRejected: "run_expired" };
  }
  return { accept: true };
}

export type CallbackInterpretation =
  | { kind: "reply"; bubbles: string[]; degraded: false }
  | { kind: "reply"; bubbles: string[]; degraded: true }
  | { kind: "failure"; status: string };

/** Bolhas utilizáveis: strings não vazias, no máximo 8. */
export function usableBubbles(reply: unknown): string[] {
  const r = (reply ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r["bubbles"]) ? (r["bubbles"] as unknown[]) : [];
  return list
    .map((b) => (typeof b === "string" ? b.trim() : ""))
    .filter((b) => b.length > 0)
    .slice(0, 8);
}

/**
 * status "ok" → resposta normal (pode ter só actions).
 * status "degraded" COM bolha utilizável → a bolha é enviada e, em seguida, handoff para humano
 *   (o cliente nunca fica só com a mensagem de espera e a conversa em "ai").
 * Qualquer outro caso (erro, degraded sem bolha) → falha sem resposta utilizável.
 */
export function interpretCallbackStatus(payload: Record<string, unknown>): CallbackInterpretation {
  const status = String(payload["status"] ?? "ok");
  const bubbles = usableBubbles(payload["reply"]);
  if (status === "ok") return { kind: "reply", bubbles, degraded: false };
  if (status === "degraded" && bubbles.length > 0) return { kind: "reply", bubbles, degraded: true };
  return { kind: "failure", status };
}

export type StaleRunAction = "expire_and_fallback" | "close_only" | "stuck_processing" | "none";

/** O que o watchdog faz com um run aberto. */
export function staleRunAction(
  run: { status: string; started_at: string },
  nowMs: number,
  n8nEnabled: boolean,
): StaleRunAction {
  const age = nowMs - new Date(run.started_at).getTime();
  if (run.status === "processing") return age > PROCESSING_STUCK_MS ? "stuck_processing" : "none";
  if (!(OPEN_RUN_STATUSES as readonly string[]).includes(run.status)) return "none";
  if (age <= DISPATCH_WATCHDOG_MS) return "none";
  if (!n8nEnabled || age > WATCHDOG_MAX_AGE_MS) return "close_only";
  return "expire_and_fallback";
}

/** Motivo interno registrado no handoff (nunca mostrado ao cliente). */
export function fallbackReason(
  kind: DispatchFailureKind | "watchdog" | "callback_failure" | "degraded_reply",
  detail?: string,
): string {
  return `n8n_fallback:${kind}${detail ? `:${detail}` : ""}`.slice(0, 200);
}

// ===========================================================================
// 2. Envio ao n8n
// ===========================================================================

/** Mantido por compatibilidade com quem já importava o tipo. */
export type DispatchResult = DispatchOutcome;

const TIMEOUT_MS = 10_000; // só o "aceite"; o trabalho real volta por callback

export async function dispatchTurnToN8n(input: {
  conversationId: string;
  messageId?: string | null;
  channel?: string;
  /** Permite testar sem a flag global (uso em teste controlado/admin). */
  force?: boolean;
}): Promise<DispatchOutcome> {
  if (!input.force && !isN8nAgentEnabled()) {
    return { ok: false, reason: "n8n_agent_disabled", kind: "disabled", attempts: 0, runClosed: false };
  }
  const url = n8nWebhookUrl();
  const secret = n8nSecret();
  if (!url || !secret) {
    return { ok: false, reason: "n8n_not_configured", kind: "not_configured", attempts: 0, runClosed: false };
  }

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
  const idempotencyKey = `${input.conversationId}:${context.message_id ?? runId}`;

  const resultado = await runDispatchAttempts(
    async () => {
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
            "idempotency-key": idempotencyKey,
          },
          body,
          signal: controller.signal,
        });
        const texto = await res.text();
        if (!res.ok) {
          return {
            ok: false as const,
            kind: classifyHttpStatus(res.status),
            httpStatus: res.status,
            reason: `n8n_http_${res.status}: ${texto.slice(0, 300)}`,
          };
        }
        let execId: string | null = null;
        try {
          const j = JSON.parse(texto) as Record<string, unknown>;
          execId = (j["executionId"] as string) ?? (j["execution_id"] as string) ?? null;
        } catch {
          execId = null;
        }
        return { ok: true as const, n8nExecutionId: execId };
      } catch (e) {
        const kind: DispatchFailureKind = classifyThrown(e);
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, kind, reason: `n8n_${kind}: ${msg}`.slice(0, 300) };
      } finally {
        clearTimeout(t);
      }
    },
    (ms) => new Promise((r) => setTimeout(r, ms)),
  );

  if (resultado.ok) {
    // Run fica ABERTO aguardando o callback do n8n (que traz a resposta).
    // Só vira "dispatched" se ainda estiver "pending" (um callback rápido pode já tê-lo assumido).
    await transitionRun(runId, ["pending"], "dispatched", null, { n8nExecutionId: resultado.n8nExecutionId });
    return { ok: true, runId, accepted: true, n8nExecutionId: resultado.n8nExecutionId, attempts: resultado.attempts };
  }

  const reason = resultado.httpStatus ? `n8n_http_${resultado.httpStatus}` : `n8n_${resultado.kind}`;
  const runClosed = await transitionRun(
    runId,
    ["pending"],
    "failed",
    `${resultado.reason} (tentativas: ${resultado.attempts})`,
  );
  return {
    ok: false,
    reason,
    kind: resultado.kind,
    httpStatus: resultado.httpStatus,
    runId,
    attempts: resultado.attempts,
    runClosed,
  };
}

// ===========================================================================
// 3–6. Fallback, roteamento, callback e watchdog
// (lógica em funções *Core com dependências injetadas; as versões sem "Core"
// só ligam as dependências reais)
// ===========================================================================

// ---------------------------------------------------------------------------
// Tipos das dependências
// ---------------------------------------------------------------------------

export type RunRow = { run_id: string; conversation_id: string; status: string; started_at: string };

export type ConversationSnapshot = { mode: string; assigned_to: string | null } | null;

export type GuardOk = {
  ok: true;
  conversation: { id: string; wa_phone: string; agent_slug: string | null; agent_name: string | null };
};
export type GuardResultLike = GuardOk | { ok: false; reason: string };

export type FallbackDeps = {
  loadConversation: (conversationId: string) => Promise<ConversationSnapshot>;
  guard: (conversationId: string) => Promise<GuardResultLike>;
  sendReplyBubbles: (args: {
    conversationId: string;
    waPhone: string;
    agentSlug: string | null;
    agentName: string | null;
    bubbles: string[];
    runId: string;
  }) => Promise<{ sent: number; aborted: boolean }>;
  performHandoff: (args: {
    conversationId: string;
    to: string;
    reason: string;
    briefing?: string;
    actor: string;
    onlyIfInAiMode: boolean;
  }) => Promise<{ executed: boolean; detail: string }>;
  /** Marca no state que a transferência já foi anunciada ao cliente (transfer_notice_shown). */
  markTransferNoticeShown: (conversationId: string) => Promise<void>;
  log: (event: string, data: Record<string, unknown>) => void;
};

export type FallbackInput = {
  conversationId: string;
  runId?: string | null;
  /** Motivo interno (vai para wa_handoff_events.reason, nunca para o cliente). */
  reason: string;
  /** Envia a mensagem fixa antes do handoff quando for seguro. */
  sendMessage: boolean;
  /** Só age sobre o cliente quando o n8n está ligado (N8N_AGENT_ENABLED). */
  allowHandoff: boolean;
  /** Contexto para o time humano (vai para o briefing do handoff). */
  briefing?: string;
};

export type FallbackResult = { handoff: boolean; messageSent: boolean; skipped: string | null };

// ---------------------------------------------------------------------------
// Fallback técnico
// ---------------------------------------------------------------------------

export async function technicalFallbackCore(input: FallbackInput, deps: FallbackDeps): Promise<FallbackResult> {
  if (!input.allowHandoff) {
    deps.log("n8n_fallback_skipped", { reason: input.reason, why: "n8n_agent_disabled", runId: input.runId ?? null });
    return { handoff: false, messageSent: false, skipped: "n8n_agent_disabled" };
  }

  const conv = await deps.loadConversation(input.conversationId);
  if (!conv) return { handoff: false, messageSent: false, skipped: "conversation_not_found" };
  if (conv.mode !== "ai" || conv.assigned_to) {
    // Já está com humano (ou concluída): não manda mensagem nem faz novo handoff.
    deps.log("n8n_fallback_skipped", { reason: input.reason, why: "already_not_ai", mode: conv.mode });
    return { handoff: false, messageSent: false, skipped: "already_not_ai" };
  }

  let messageSent = false;
  if (input.sendMessage) {
    const guard = await deps.guard(input.conversationId);
    if (guard.ok) {
      const envio = await deps.sendReplyBubbles({
        conversationId: input.conversationId,
        waPhone: guard.conversation.wa_phone,
        agentSlug: guard.conversation.agent_slug,
        agentName: guard.conversation.agent_name,
        bubbles: [FALLBACK_MESSAGE],
        runId: input.runId ?? "n8n-fallback",
      });
      messageSent = envio.sent > 0;
      if (messageSent) {
        // A mensagem fixa anuncia a transferência: próximos handoffs humanos ficam silenciosos.
        try {
          await deps.markTransferNoticeShown(input.conversationId);
        } catch (e) {
          deps.log("n8n_fallback_notice_state_failed", { reason: input.reason, error: String(e) });
        }
      }
    } else {
      // Sem condição segura de envio: prioriza o handoff e registra o motivo.
      deps.log("n8n_fallback_message_skipped", { reason: input.reason, guard: guard.reason });
    }
  }

  const handoff = await deps.performHandoff({
    conversationId: input.conversationId,
    to: "human",
    reason: input.reason,
    briefing:
      input.briefing ??
      "Falha técnica no agente automático. Atendimento transferido para o time sem resposta da IA neste turno.",
    actor: "n8n-fallback",
    onlyIfInAiMode: true,
  });
  deps.log("n8n_fallback_done", {
    reason: input.reason,
    handoff: handoff.executed,
    messageSent,
    runId: input.runId ?? null,
  });
  return { handoff: handoff.executed, messageSent, skipped: handoff.executed ? null : handoff.detail };
}

// ---------------------------------------------------------------------------
// Roteamento do turno
// ---------------------------------------------------------------------------

export type RouteDeps = {
  isEnabled: () => boolean;
  hasOpenRun: (conversationId: string) => Promise<boolean>;
  dispatch: (args: { conversationId: string; messageId: string | null }) => Promise<DispatchOutcome>;
  runLegacy: () => Promise<void>;
  fallback: (input: FallbackInput) => Promise<FallbackResult>;
};

export type RouteResult =
  | { route: "legacy" }
  | { route: "n8n_busy" }
  | { route: "n8n_dispatched"; runId: string }
  | { route: "n8n_run_not_closed"; runId: string | null }
  | { route: "human_fallback"; runId: string | null; fallback: FallbackResult };

export async function routeAiTurnCore(
  input: { conversationId: string; messageId: string | null },
  deps: RouteDeps,
): Promise<RouteResult> {
  if (!deps.isEnabled()) {
    await deps.runLegacy();
    return { route: "legacy" };
  }
  // Nunca dois turnos simultâneos no n8n para a mesma conversa (evita resposta duplicada).
  if (await deps.hasOpenRun(input.conversationId)) return { route: "n8n_busy" };

  const out = await deps.dispatch(input);
  if (out.ok) return { route: "n8n_dispatched", runId: out.runId };
  if (shouldUseLegacy(out)) {
    await deps.runLegacy();
    return { route: "legacy" };
  }
  // O run já foi assumido por um callback (ex.: timeout de aceite, mas o n8n respondeu): não interfere.
  if (!out.runClosed) return { route: "n8n_run_not_closed", runId: out.runId ?? null };

  const fb = await deps.fallback({
    conversationId: input.conversationId,
    runId: out.runId ?? null,
    reason: fallbackReason(out.kind, out.httpStatus ? String(out.httpStatus) : undefined),
    sendMessage: true,
    allowHandoff: true,
  });
  return { route: "human_fallback", runId: out.runId ?? null, fallback: fb };
}

// ---------------------------------------------------------------------------
// Callback do n8n
// ---------------------------------------------------------------------------

export type CallbackDeps = {
  loadRun: (runId: string) => Promise<RunRow | null>;
  transitionRun: (runId: string, from: string[], to: string, error?: string | null) => Promise<boolean>;
  finishRun: (
    runId: string,
    patch: {
      status: string;
      n8nExecutionId?: string | null;
      actions?: unknown;
      stateUpdate?: unknown;
      error?: string | null;
    },
  ) => Promise<void>;
  guard: (conversationId: string) => Promise<GuardResultLike>;
  applyStatePatch: (conversationId: string, patch: unknown) => Promise<void>;
  sendReplyBubbles: FallbackDeps["sendReplyBubbles"];
  executeActions: (args: { conversationId: string; runId: string; actions: unknown }) => Promise<unknown>;
  fallback: (input: FallbackInput) => Promise<FallbackResult>;
  isEnabled: () => boolean;
  rescheduleIfInboundDuringRun: (conversationId: string, runStartedAt: string) => Promise<void>;
  now: () => number;
};

export async function processN8nCallbackCore(
  payload: Record<string, unknown>,
  runId: string,
  deps: CallbackDeps,
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const run = await deps.loadRun(runId);
  const decisao = callbackDecision(run, deps.now());
  if (!decisao.accept) {
    if (decisao.markRejected && run)
      await deps.transitionRun(runId, ["pending", "dispatched"], "rejected", decisao.markRejected);
    return { httpStatus: decisao.httpStatus, body: decisao.body };
  }
  const aberto = run as RunRow;

  const conversationId = String(payload["conversation_id"] ?? "") || aberto.conversation_id;
  if (conversationId !== aberto.conversation_id) {
    await deps.transitionRun(runId, ["pending", "dispatched"], "rejected", "conversation_mismatch");
    return { httpStatus: 409, body: { ok: false, error: "conversation_mismatch" } };
  }

  // Reivindicação atômica: só UM callback processa o run (dedupe e corrida com o watchdog).
  const claimed = await deps.transitionRun(runId, ["pending", "dispatched"], "processing");
  if (!claimed) {
    const atual = await deps.loadRun(runId);
    const d2 = callbackDecision(atual, deps.now());
    return d2.accept
      ? { httpStatus: 409, body: { ok: false, error: "run_in_progress" } }
      : { httpStatus: d2.httpStatus, body: d2.body };
  }

  const n8nExecutionId = (payload["n8n_execution_id"] as string) ?? null;
  const interpretacao = interpretCallbackStatus(payload);
  if (interpretacao.kind === "failure") {
    await deps.finishRun(runId, {
      status: "failed",
      n8nExecutionId,
      error: JSON.stringify(payload["error"] ?? `n8n_status_${interpretacao.status}`).slice(0, 500),
    });
    const fb = await deps.fallback({
      conversationId,
      runId,
      reason: fallbackReason("callback_failure", interpretacao.status),
      sendMessage: true,
      allowHandoff: deps.isEnabled(),
    });
    return { httpStatus: 200, body: { ok: true, handled: "error_reported", fallback: fb } };
  }

  const guard = await deps.guard(conversationId);
  if (!guard.ok) {
    await deps.finishRun(runId, { status: "rejected", n8nExecutionId, error: guard.reason });
    return { httpStatus: 200, body: { ok: true, skipped: guard.reason } };
  }

  const stateUpdate = payload["state_update"] ?? null;
  if (stateUpdate) await deps.applyStatePatch(conversationId, stateUpdate);

  let envio = { sent: 0, aborted: false };
  if (interpretacao.bubbles.length) {
    envio = await deps.sendReplyBubbles({
      conversationId,
      waPhone: guard.conversation.wa_phone,
      agentSlug: guard.conversation.agent_slug,
      agentName: guard.conversation.agent_name,
      bubbles: interpretacao.bubbles,
      runId,
    });
  }

  const resultados = await deps.executeActions({ conversationId, runId, actions: payload["actions"] });

  // degraded COM bolha: a bolha (mensagem de espera) já foi enviada acima. O cliente não pode
  // ficar abandonado com a conversa em "ai": aplica o MESMO handoff para humano, sem mensagem
  // fixa extra (evita resposta duplicada). Estado e histórico já estão gravados (contexto
  // preservado). Se uma action "handoff" deste turno já transferiu, o fallback não repete.
  let handoffDegradado: FallbackResult | null = null;
  if (interpretacao.degraded && !envio.aborted) {
    handoffDegradado = await deps.fallback({
      conversationId,
      runId,
      reason: fallbackReason("degraded_reply"),
      briefing:
        "O agente automático não concluiu o turno e enviou apenas uma mensagem de espera ao cliente. Continue o atendimento a partir do histórico e do estado da conversa.",
      sendMessage: false,
      allowHandoff: deps.isEnabled(),
    });
  }

  await deps.finishRun(runId, {
    status: envio.aborted ? "rejected" : "completed",
    n8nExecutionId,
    actions: resultados,
    stateUpdate,
    error: envio.aborted
      ? "human_takeover_during_send"
      : interpretacao.degraded
        ? handoffDegradado?.handoff
          ? "degraded_reply_handoff"
          : "degraded_reply"
        : null,
  });

  // Turno degradado vai para humano: não reagenda novo turno de IA.
  if (!envio.aborted && !interpretacao.degraded) {
    await deps.rescheduleIfInboundDuringRun(conversationId, aberto.started_at);
  }

  return {
    httpStatus: 200,
    body: {
      ok: true,
      bubbles_sent: envio.sent,
      actions: resultados,
      degraded: interpretacao.degraded,
      handoff: handoffDegradado?.handoff ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// Watchdog
// ---------------------------------------------------------------------------

export type SweepDeps = {
  listStaleOpenRuns: (olderThanMs: number) => Promise<RunRow[]>;
  transitionRun: CallbackDeps["transitionRun"];
  isEnabled: () => boolean;
  fallback: (input: FallbackInput) => Promise<FallbackResult>;
  now: () => number;
};

export async function sweepStaleRunsCore(
  deps: SweepDeps,
): Promise<{ expired: number; closed: number; stuck: number; handoffs: number }> {
  const resumo = { expired: 0, closed: 0, stuck: 0, handoffs: 0 };
  const enabled = deps.isEnabled();
  const runs = await deps.listStaleOpenRuns(DISPATCH_WATCHDOG_MS);
  for (const run of runs) {
    const acao = staleRunAction(run, deps.now(), enabled);
    if (acao === "none") continue;
    if (acao === "close_only") {
      if (
        await deps.transitionRun(run.run_id, ["pending", "dispatched"], "expired", "watchdog_closed_without_fallback")
      )
        resumo.closed++;
      continue;
    }
    if (acao === "expire_and_fallback") {
      const claimed = await deps.transitionRun(
        run.run_id,
        ["pending", "dispatched"],
        "expired",
        "callback_watchdog_3min",
      );
      if (!claimed) continue; // um callback chegou antes: nada a fazer
      resumo.expired++;
      const fb = await deps.fallback({
        conversationId: run.conversation_id,
        runId: run.run_id,
        reason: fallbackReason("watchdog", "no_callback_3min"),
        sendMessage: true,
        allowHandoff: true,
      });
      if (fb.handoff) resumo.handoffs++;
      continue;
    }
    // stuck_processing: callback travou no meio. Pode ter enviado bolhas → sem mensagem fixa.
    const claimed = await deps.transitionRun(run.run_id, ["processing"], "failed", "callback_processing_stuck");
    if (!claimed) continue;
    resumo.stuck++;
    const fb = await deps.fallback({
      conversationId: run.conversation_id,
      runId: run.run_id,
      reason: fallbackReason("watchdog", "processing_stuck"),
      sendMessage: false,
      allowHandoff: enabled,
    });
    if (fb.handoff) resumo.handoffs++;
  }
  return resumo;
}

// ---------------------------------------------------------------------------
// Ligação com as dependências reais
// ---------------------------------------------------------------------------

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function realFallbackDeps(): Promise<FallbackDeps> {
  const { guardBeforeExecute, sendReplyBubbles, performHandoff } = await import("./actions.server");
  return {
    loadConversation: async (conversationId) => {
      const supabase = await db();
      const { data } = await supabase
        .from("wa_conversations")
        .select("mode, assigned_to")
        .eq("id", conversationId)
        .maybeSingle();
      if (!data) return null;
      const c = data as { mode?: string | null; assigned_to?: string | null };
      return { mode: String(c.mode ?? ""), assigned_to: c.assigned_to ?? null };
    },
    guard: guardBeforeExecute,
    sendReplyBubbles,
    performHandoff,
    markTransferNoticeShown: async (conversationId) => {
      const { applyAgentStatePatch } = await import("./state.server");
      await applyAgentStatePatch(conversationId, { transfer_notice_shown: true });
    },
    log: (event, data) => console.warn(`[n8n/fallback] ${event}`, JSON.stringify(data)),
  };
}

export async function technicalFallback(input: FallbackInput): Promise<FallbackResult> {
  return technicalFallbackCore(input, await realFallbackDeps());
}

export async function routeAiTurn(input: {
  conversationId: string;
  messageId: string | null;
  runLegacy: () => Promise<void>;
}): Promise<RouteResult> {
  const { isN8nAgentEnabled } = await import("./config.server");
  const { hasOpenRun } = await import("./runs.server");
  return routeAiTurnCore(
    { conversationId: input.conversationId, messageId: input.messageId },
    {
      isEnabled: isN8nAgentEnabled,
      hasOpenRun,
      dispatch: (a) => dispatchTurnToN8n({ conversationId: a.conversationId, messageId: a.messageId }),
      runLegacy: input.runLegacy,
      fallback: technicalFallback,
    },
  );
}

export async function processN8nCallback(
  payload: Record<string, unknown>,
  runId: string,
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const { loadRun, finishRun, transitionRun } = await import("./runs.server");
  const { guardBeforeExecute, executeActions, sendReplyBubbles } = await import("./actions.server");
  const { applyAgentStatePatch } = await import("./state.server");
  const { isN8nAgentEnabled } = await import("./config.server");
  return processN8nCallbackCore(payload, runId, {
    loadRun,
    transitionRun: (id, from, to, error) => transitionRun(id, from as never, to as never, error),
    finishRun: (id, patch) => finishRun(id, patch as never),
    guard: guardBeforeExecute,
    applyStatePatch: async (conversationId, patch) => {
      await applyAgentStatePatch(conversationId, patch as never);
    },
    sendReplyBubbles,
    executeActions: (args) => executeActions(args as never),
    fallback: technicalFallback,
    isEnabled: isN8nAgentEnabled,
    rescheduleIfInboundDuringRun,
    now: () => Date.now(),
  });
}

export async function sweepStaleRuns() {
  const { listStaleOpenRuns, transitionRun } = await import("./runs.server");
  const { isN8nAgentEnabled } = await import("./config.server");
  return sweepStaleRunsCore({
    listStaleOpenRuns,
    transitionRun: (id, from, to, error) => transitionRun(id, from as never, to as never, error),
    isEnabled: isN8nAgentEnabled,
    fallback: technicalFallback,
    now: () => Date.now(),
  });
}

/**
 * Mensagens do cliente que chegaram enquanto o n8n processava o turno ficam
 * sem agendamento (o dispatcher não dispara 2 runs ao mesmo tempo). Reagenda
 * um novo turno curto, só se a conversa continua em IA e sem agendamento.
 */
export async function rescheduleIfInboundDuringRun(conversationId: string, runStartedAt: string): Promise<void> {
  try {
    const supabase = await db();
    const { data: ultima } = await supabase
      .from("wa_messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const criada = (ultima as { created_at?: string } | null)?.created_at;
    if (!criada || new Date(criada).getTime() <= new Date(runStartedAt).getTime()) return;
    await supabase
      .from("wa_conversations")
      .update({ ai_debounce_until: new Date(Date.now() + 15_000).toISOString() } as never)
      .eq("id", conversationId)
      .eq("mode", "ai")
      .is("ai_debounce_until", null);
  } catch (e) {
    console.error("[n8n/fallback] rescheduleIfInboundDuringRun", e);
  }
}
