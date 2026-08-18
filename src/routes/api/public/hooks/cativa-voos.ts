import { createFileRoute } from "@tanstack/react-router";

/**
 * Fila de voos da Cativa, sem a trava global do runner.
 * Cada item é adquirido de forma atômica (pendente -> processando),
 * então várias chamadas podem rodar em paralelo com segurança.
 */
export const Route = createFileRoute("/api/public/hooks/cativa-voos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !anon || apikey !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { limite?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const limite = Math.min(20, Math.max(1, typeof body.limite === "number" ? body.limite : 6));

        try {
          const { processarFilaVoos } = await import("@/lib/cativa/voos.server");
          const voos = await processarFilaVoos(limite);
          return new Response(JSON.stringify({ voos }), {
            headers: { "Content-Type": "application/json" },
          });
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
