/**
 * POST /api/public/hooks/n8n-reply
 *
 * Callback do n8n para o Lovable. Só aceita chamadas assinadas (HMAC-SHA256
 * sobre `${timestamp}.${body}` com N8N_AGENT_SECRET) e dentro de 5 minutos.
 *
 * O n8n DECIDE; o Lovable EXECUTA — e antes de executar reverifica: modo IA,
 * ai_paused, assunção humana, kill switch global, bloqueio por fraude e
 * validade do run_id. Nenhuma mensagem chega ao WhatsApp sem passar por isso.
 *
 * Callback de run já encerrado (failed/rejected/expired — ex.: timeout ou
 * watchdog que já transferiu para humano) é recusado e nunca envia nada.
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

        // Regras do callback em dispatch.server.ts (processN8nCallbackCore):
        // - run inexistente → 404; concluído → dedupe; failed/rejected/expired → 409 (nunca envia);
        // - run com mais de 10 min → 409 run_expired;
        // - reivindicação atômica do run (só UM callback processa; corrida com o watchdog);
        // - status "degraded" COM bolha válida → enviado normalmente;
        // - falha sem resposta utilizável → mensagem fixa + handoff (se N8N_AGENT_ENABLED);
        // - guardBeforeExecute continua bloqueando envio com mode != ai, IA pausada ou humano atribuído.
        const { processN8nCallback } = await import("@/lib/n8n/dispatch.server");
        const resultado = await processN8nCallback(payload, runId);
        return json(resultado.body, resultado.httpStatus);
      },
    },
  },
});
