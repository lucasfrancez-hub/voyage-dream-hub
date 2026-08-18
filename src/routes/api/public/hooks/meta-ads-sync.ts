import { createFileRoute } from "@tanstack/react-router";

/**
 * Sincroniza as métricas dos impulsionamentos com a Meta.
 * Roda via pg_cron a cada 15 minutos.
 */
export const Route = createFileRoute("/api/public/hooks/meta-ads-sync")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { sincronizarPendentes } = await import("@/lib/ads/sync.server");
          const resultados = await sincronizarPendentes(25);
          return Response.json({ ok: true, total: resultados.length, resultados });
        } catch (e) {
          console.error("[meta-ads-sync]", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
