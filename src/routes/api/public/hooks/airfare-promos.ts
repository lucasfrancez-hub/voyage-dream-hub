/**
 * Cron: coleta automática das Promoções de Aéreo — 100% backend.
 *
 * Modos:
 *  - `{"trigger":"cron"}`  → 06:00 e 12:00 BRT: cria a execução (trava global),
 *    faz a descoberta, enfileira as candidatas e processa o primeiro lote.
 *  - `{"runId":"..."}`     → executor do botão "Atualizar agora".
 *  - `{"resume":true}`     → worker de retomada (cron a cada minuto): consome o
 *    que sobrou da fila. Fechar a aba, deslogar ou desligar o computador não
 *    interrompe nada: a fila vive no banco e o worker continua sozinho.
 *
 * Nenhum modo usa sessão, cookie ou token do admin — apenas a credencial de
 * servidor (service role), que nunca é exposta ao frontend.
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
            resume?: boolean;
            maxRoutes?: number;
          };

          // modo worker: apenas retoma o que estiver pendente
          if (body.resume) {
            const { resumeActiveRun } = await import("@/lib/airfare-promos.worker.server");
            const res = await resumeActiveRun();
            return Response.json({ ok: true, ...res, ts: new Date().toISOString() });
          }

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
