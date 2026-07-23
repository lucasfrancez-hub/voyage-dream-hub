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
          const { generateBroadcastSuggestions } = await import("@/lib/broadcast/suggestions.server");
          // cron não tem sessão — grava sem autor
          void supabaseAdmin;
          const res = await generateBroadcastSuggestions(null);
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
