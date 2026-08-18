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

        let body: { limite?: number; recalcularTudo?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const limite = Math.min(20, Math.max(1, typeof body.limite === "number" ? body.limite : 6));

        try {
          // Recalcular tudo: recoloca todos os pacotes ativos com link na fila,
          // para regravar aéreo, taxas e valor total a partir da Infotravel.
          if (body.recalcularTudo) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { count } = await supabaseAdmin
              .from("cativa_pacotes")
              .select("id", { count: "exact", head: true })
              .eq("status", "ativo")
              .not("link_orcamento", "is", null);
            await supabaseAdmin
              .from("cativa_pacotes")
              .update({
                voos_status: "pendente",
                voos_tentativas: 0,
                voos_prioridade: 3,
                voos_erro: null,
                voos_proxima_em: new Date().toISOString(),
              } as any)
              .eq("status", "ativo")
              .not("link_orcamento", "is", null);
            return new Response(JSON.stringify({ enfileirados: count ?? 0 }), {
              headers: { "Content-Type": "application/json" },
            });
          }
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
