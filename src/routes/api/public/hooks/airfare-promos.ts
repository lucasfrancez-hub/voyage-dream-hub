/**
 * Cron: coleta automática das Promoções de Aéreo.
 * Agendado para 09:00 e 15:00 (BRT) via pg_cron chamando este endpoint.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/airfare-promos")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { collectAirfarePromotions } = await import("@/lib/airfare-promos.server");
          const res = await collectAirfarePromotions({ maxRoutes: 14 });
          return Response.json({ ok: true, ...res, ts: new Date().toISOString() });
        } catch (err) {
          console.error("[airfare-promos] error", err);
          return new Response(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
