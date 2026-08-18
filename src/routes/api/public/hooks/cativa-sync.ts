import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron do catálogo Cativa: sincroniza as planilhas e processa um lote da fila
 * de voos da Infotravel. Chamado pelo pg_cron.
 */
export const Route = createFileRoute("/api/public/hooks/cativa-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !anon || apikey !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { planilhas?: boolean; voos?: boolean; limiteVoos?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const { rodarCativa } = await import("@/lib/cativa/runner.server");
        try {
          const r = await rodarCativa({
            planilhas: body.planilhas !== false,
            voos: body.voos !== false,
            limiteVoos: typeof body.limiteVoos === "number" ? Math.min(50, body.limiteVoos) : 15,
          });
          return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
