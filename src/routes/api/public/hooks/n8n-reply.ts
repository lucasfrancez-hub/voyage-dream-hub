/**
 * POST /api/public/hooks/n8n-reply
 *
 * Callback do n8n para o Lovable. Só aceita chamadas assinadas (HMAC-SHA256
 * sobre `${timestamp}.${body}` com N8N_AGENT_SECRET) e dentro de 5 minutos.
 *
 * O n8n DECIDE; o Lovable EXECUTA — e antes de executar reverifica: modo IA,
 * ai_paused, assunção humana, kill switch global, bloqueio por fraude e
 * validade do run_id. Nenhuma mensagem chega ao WhatsApp sem passar por isso.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/n8n-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyCallbackSignature } = await import("@/lib/n8n/config.server");
        const check = verifyCallbackSignature({
          body: raw,
          signature: request.headers.get("x-viaair-signature"),
          timestamp: request.headers.get("x-viaair-timestamp"),
        });
        if (!check.ok) return json({ ok: false, error: check.reason }, 401);

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: "invalid_json" }, 422);
        }

        const runId = String(payload["run_id"] ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(runId)) return json({ ok: false, error: "invalid_run_id" }, 422);

        const { loadRun, finishRun } = await import("@/lib/n8n/runs.server");
        const run = await loadRun(runId);
        if (!run) return json({ ok: false, error: "run_not_found" }, 404);
        if (run.status === "completed") return json({ ok: true, deduped: true });
        // Run velho (mais de 10 min) não executa mais nada.
        if (Date.now() - new Date(run.started_at).getTime() > 10 * 60_000) {
          await finishRun(runId, { status: "rejected", error: "run_expired" });
          return json({ ok: false, error: "run_expired" }, 409);
        }

        const conversationId =
          String(payload["conversation_id"] ?? "") || run.conversation_id;
        if (conversationId !== run.conversation_id) {
          await finishRun(runId, { status: "rejected", error: "conversation_mismatch" });
          return json({ ok: false, error: "conversation_mismatch" }, 409);
        }

        const status = String(payload["status"] ?? "ok");
        if (status !== "ok") {
          await finishRun(runId, {
            status: "failed",
            n8nExecutionId: (payload["n8n_execution_id"] as string) ?? null,
            error: JSON.stringify(payload["error"] ?? "n8n_error").slice(0, 500),
          });
          return json({ ok: true, handled: "error_reported" });
        }

        const { guardBeforeExecute, executeActions, sendReplyBubbles } = await import(
          "@/lib/n8n/actions.server"
        );
        const guard = await guardBeforeExecute(conversationId);
        if (!guard.ok) {
          await finishRun(runId, { status: "rejected", error: guard.reason });
          return json({ ok: true, skipped: guard.reason });
        }

        // Estado estruturado
        const { applyAgentStatePatch } = await import("@/lib/n8n/state.server");
        const stateUpdate = payload["state_update"] ?? null;
        if (stateUpdate) await applyAgentStatePatch(conversationId, stateUpdate);

        // Texto
        const reply = (payload["reply"] ?? {}) as Record<string, unknown>;
        const bubbles = Array.isArray(reply["bubbles"])
          ? (reply["bubbles"] as unknown[]).map((b) => String(b)).slice(0, 8)
          : [];
        let envio = { sent: 0, aborted: false };
        if (bubbles.length) {
          envio = await sendReplyBubbles({
            conversationId,
            waPhone: guard.conversation.wa_phone,
            agentSlug: guard.conversation.agent_slug,
            agentName: guard.conversation.agent_name,
            bubbles,
            runId,
          });
        }

        // Ações
        const resultados = await executeActions({
          conversationId,
          runId,
          actions: payload["actions"],
        });

        await finishRun(runId, {
          status: envio.aborted ? "rejected" : "completed",
          n8nExecutionId: (payload["n8n_execution_id"] as string) ?? null,
          actions: resultados,
          stateUpdate,
          error: envio.aborted ? "human_takeover_during_send" : null,
        });

        return json({ ok: true, bubbles_sent: envio.sent, actions: resultados });
      },
    },
  },
});
