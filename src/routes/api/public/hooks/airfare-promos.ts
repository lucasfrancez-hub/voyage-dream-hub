/**
 * Cron: coleta automática das Promoções de Aéreo.
 * Agendado para 06:00 e 12:00 (BRT) via pg_cron chamando este endpoint.
 *
 * Também é o executor em segundo plano do botão "Atualizar agora" do
 * Command Center: o admin cria a execução (trava) e dispara este endpoint
 * com o `runId`, sem precisar manter a página aberta.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/airfare-promos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let runId: string | undefined;
        try {
          const body = (await request.json().catch(() => ({}))) as {
            runId?: string;
            trigger?: string;
            maxRoutes?: number;
          };
          const { collectAirfarePromotions, startPromoRun, failPromoRun } = await import(
            "@/lib/airfare-promos.server"
          );

          runId = body.runId;
          if (!runId) {
            const run = await startPromoRun(body.trigger === "manual" ? "manual" : "cron");
            if (!run) {
              return Response.json({ ok: true, skipped: "coleta_em_andamento" });
            }
            runId = run.id;
          }

          try {
            const res = await collectAirfarePromotions({ maxRoutes: body.maxRoutes ?? 14, runId });
            return Response.json({ ok: true, ...res, runId, ts: new Date().toISOString() });
          } catch (err) {
            await failPromoRun(runId, err instanceof Error ? err.message : String(err));
            throw err;
          }
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
