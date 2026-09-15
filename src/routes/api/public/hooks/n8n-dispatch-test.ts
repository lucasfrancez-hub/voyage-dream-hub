/**
 * POST /api/public/hooks/n8n-dispatch-test
 *
 * Dispara um turno pelo FLUXO REAL do backend (buildN8nAgentContext →
 * grava o run em n8n_agent_runs → envia assinado ao n8n), sem passar pelo
 * dispatcher de atendimento. Serve para testar a ponte ponta a ponta.
 *
 * Só aceita chamadas assinadas com a MESMA assinatura HMAC-SHA256 do
 * callback (`${timestamp}.${body}` com N8N_AGENT_SECRET). Nenhum segredo é
 * devolvido na resposta.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/n8n-dispatch-test")({
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

        const conversationId = String(payload["conversation_id"] ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(conversationId)) {
          return json({ ok: false, error: "invalid_conversation_id" }, 422);
        }
        const messageId = payload["message_id"] ? String(payload["message_id"]) : null;

        const { dispatchTurnToN8n } = await import("@/lib/n8n/dispatch.server");
        const res = await dispatchTurnToN8n({
          conversationId,
          messageId,
          channel: payload["channel"] ? String(payload["channel"]) : undefined,
          force: true,
        });
        return json(res, res.ok ? 202 : 502);
      },
    },
  },
});
