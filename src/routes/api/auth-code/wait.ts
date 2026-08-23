/**
 * POST /api/auth-code/wait
 *
 * Serviço interno usado por automações de login (robôs, conectores) para
 * obter o código 2FA recebido por e-mail na caixa dedicada.
 *
 * Exige o segredo interno AUTH_CODE_INTERNAL_SECRET no header
 * `x-auth-code-secret`. Não está sob /api/public — nunca deve ser chamado
 * pelo navegador do cliente.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  provider: z.string().min(1),
  requestedAt: z.string().optional(),
  authAttemptId: z.string().uuid().optional(),
  loginHint: z.string().max(200).optional(),
  timeoutMs: z.number().int().min(5000).max(300000).optional(),
});

export const Route = createFileRoute("/api/auth-code/wait")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["AUTH_CODE_INTERNAL_SECRET"];
        const enviado = request.headers.get("x-auth-code-secret") ?? "";
        if (!segredo || enviado !== segredo) {
          return new Response("unauthorized", { status: 401 });
        }

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return Response.json({ success: false, error: "payload inválido" }, { status: 400 });
        }
        const parsed = schema.safeParse(corpo);
        if (!parsed.success) {
          return Response.json({ success: false, error: "payload inválido" }, { status: 400 });
        }
        const dados = parsed.data;

        const { iniciarTentativa, aguardarCodigo, ESPERA_PADRAO_MS } = await import(
          "@/lib/auth-code/service.server"
        );

        let authAttemptId = dados.authAttemptId ?? "";
        let requestedAt = dados.requestedAt ?? new Date().toISOString();
        if (!authAttemptId) {
          const t = await iniciarTentativa({
            provider: dados.provider,
            loginHint: dados.loginHint ?? null,
            requestedAt,
          });
          authAttemptId = t.authAttemptId;
          requestedAt = t.requestedAt;
        }

        const r = await aguardarCodigo({
          authAttemptId,
          provider: dados.provider,
          requestedAt,
          timeoutMs: dados.timeoutMs ?? ESPERA_PADRAO_MS,
        });

        if (!r.success) {
          return Response.json(
            { success: false, authAttemptId: r.authAttemptId, error: r.error },
            { status: 404 },
          );
        }
        return Response.json({
          success: true,
          authAttemptId: r.authAttemptId,
          messageId: r.messageId,
          receivedAt: r.receivedAt,
          code: r.code,
        });
      },
    },
  },
});
