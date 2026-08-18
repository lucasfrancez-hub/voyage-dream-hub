import { createFileRoute } from "@tanstack/react-router";

/**
 * SLOT do radar de promoções de aéreo — mesmo padrão da fila de voos da Cativa.
 *
 * O cron dispara várias chamadas por minuto; cada chamada valida UMA candidata
 * dentro do próprio tempo de vida da invocação e sai. Sem trava global: as
 * reservas são atômicas, então os slots rodam em paralelo com segurança e
 * nenhuma execução fica presa esperando um worker longo.
 */
export const Route = createFileRoute("/api/public/hooks/airfare-promos-slot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const anon = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!apikey || !anon || apikey !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { budgetMs?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        try {
          const { runValidationSlot, SLOT_BUDGET_MS } = await import("@/lib/airfare-promos.worker.server");
          const budget =
            typeof body.budgetMs === "number"
              ? Math.min(110_000, Math.max(45_000, body.budgetMs))
              : SLOT_BUDGET_MS;
          const res = await runValidationSlot(budget);
          return Response.json({ ok: true, ...res, ts: new Date().toISOString() });
        } catch (e) {
          console.error("[airfare-promos-slot] error", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
