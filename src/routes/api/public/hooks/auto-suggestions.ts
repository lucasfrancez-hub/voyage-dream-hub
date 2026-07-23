/**
 * Cron: gera sugestões de broadcast automaticamente todo dia de manhã.
 * Chamado por pg_cron via /api/public/hooks/auto-suggestions.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/auto-suggestions")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Descobre um usuário admin/marketing pra registrar o autor
          const { data: role } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "marketing"])
            .limit(1)
            .maybeSingle();
          const userId = role?.user_id ?? "00000000-0000-0000-0000-000000000000";

          const { generateBroadcastSuggestions } = await import("@/lib/broadcast/suggestions.server");
          const res = await generateBroadcastSuggestions(userId);
          return Response.json({ ok: true, ...res, ts: new Date().toISOString() });
        } catch (err) {
          console.error("[auto-suggestions] error", err);
          return new Response(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
