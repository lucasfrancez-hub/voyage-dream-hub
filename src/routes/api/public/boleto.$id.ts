import { createFileRoute } from "@tanstack/react-router";
import { renderBoletoHtml } from "@/lib/boleto-html";
import { recebimentoParaBoleto } from "@/lib/boleto-map";

/** Link público do boleto VIA AIR (enviado ao cliente). */
export const Route = createFileRoute("/api/public/boleto/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Not found", { status: 404 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("asaas_recebimentos")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error || !data) return new Response("Boleto não encontrado", { status: 404 });

        const html = renderBoletoHtml(recebimentoParaBoleto(data));
        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
