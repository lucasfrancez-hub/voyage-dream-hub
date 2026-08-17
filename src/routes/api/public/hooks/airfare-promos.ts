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
            force?: boolean;
            maxRoutes?: number;
          };

          // cancelamento cooperativo da coleta ativa (auditoria/operação)
          if (body.trigger === "cancel") {
            const { requestPromoRunCancel } = await import("@/lib/airfare-promos.server");
            const res = await requestPromoRunCancel(body.runId);
            return Response.json({ ok: true, ...res, ts: new Date().toISOString() });
          }


          // 00:00 BRT: encerra o ciclo diário (zera a curadoria ativa)
          if (body.trigger === "midnight") {
            const { closeDailyCuration } = await import("@/lib/airfare-promos.worker.server");
            const res = await closeDailyCuration();
            return Response.json({ ok: true, ...res, ts: new Date().toISOString() });
          }

          // limpeza diária dos arquivados com mais de 30 dias
          if (body.trigger === "cleanup") {
            const { cleanupArchivedPromotions, archiveStalePromotions } = await import(
              "@/lib/airfare-promos.worker.server"
            );
            const arq = await archiveStalePromotions();
            const res = await cleanupArchivedPromotions();
            return Response.json({ ok: true, archived: arq.archived, ...res, ts: new Date().toISOString() });
          }

          // saneamento retroativo completo (arquiva antigas + limpa 30 dias)
          if (body.trigger === "sanitize") {
            const { sanitizeArchiveCycle } = await import("@/lib/airfare-promos.worker.server");
            const res = await sanitizeArchiveCycle();
            return Response.json({ ok: true, ...res, ts: new Date().toISOString() });
          }

          // modo worker: apenas retoma o que estiver pendente
          if (body.resume) {
            const { resumeActiveRun } = await import("@/lib/airfare-promos.worker.server");
            const res = await resumeActiveRun();
            return Response.json({ ok: true, ...res, ts: new Date().toISOString() });
          }

          // DIAGNÓSTICO do radar no runtime real (sem criar execução nem gravar nada).
          if (body.trigger === "radar_diag") {
            const radar = await import("@/lib/melhores-destinos.radar-api.server");
            radar.resetRadarMetrics();
            const origem = (body as { origin?: string }).origin ?? "MGF";
            const t0 = Date.now();
            let erro: string | null = null;
            let leads = 0;
            let amostra: string[] = [];
            try {
              const r = await radar.radarLeadsForOrigin(origem, { deadline: Date.now() + 25_000 });
              leads = r.length;
              amostra = r.slice(0, 5).map((l) => `${l.origin.iata}->${l.destination.iata} ${l.radarPrice}`);
            } catch (e) {
              erro = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
            }
            return Response.json({
              ok: true,
              trigger: "manual_diag",
              radar_adapter: "melhores-destinos.radar-api.server",
              origin: origem,
              leads,
              amostra,
              erro,
              ms: Date.now() - t0,
              metrics: radar.radarSourceMetrics(),
            });
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
            const res = await collectAirfarePromotions({
              maxRoutes: body.maxRoutes ?? 14,
              runId,
              trigger: body.trigger === "manual" || body.runId ? "manual" : "cron",
            });
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
