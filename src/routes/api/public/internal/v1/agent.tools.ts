/**
 * GET /api/public/internal/v1/agent/tools
 *
 * Catálogo machine-readable das ferramentas que o agente do n8n pode chamar.
 * Filtrado pelos escopos do próprio token, para o agente nunca tentar uma
 * operação que não tem permissão.
 *
 * ?role=air|consultant  → só as ferramentas daquela função.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/internal/v1/agent/tools")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApi(request, "flights:read", async (ctx) => {
          const { N8N_TOOLS, toolsForRole, toolsForScopes } = await import("@/lib/n8n/tools-catalog");
          const { CONVERSATION_RULES, DETERMINISTIC_RULES, ROLE_SCOPE, RULES_VERSION } = await import(
            "@/lib/n8n/conversation-rules"
          );
          const role = new URL(request.url).searchParams.get("role");
          const base = role === "air" || role === "consultant" ? toolsForRole(role) : N8N_TOOLS;
          const tools = toolsForScopes(base, ctx.client.scopes);
          return ok(
            {
              baseUrl: "https://pedidos.viaair.tur.br",
              auth: "Authorization: Bearer <token do n8n>",
              scopes: ctx.client.scopes,
              rules_version: RULES_VERSION,
              conversation_rules: CONVERSATION_RULES,
              enforced_by_server: DETERMINISTIC_RULES,
              role_scope: role === "air" || role === "consultant" ? ROLE_SCOPE[role] : ROLE_SCOPE,
              tools,
            },
            ctx.correlationId,
          );
        }),
    },
  },
});
