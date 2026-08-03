import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "broadcast-media";

/**
 * Serve publicamente os arquivos enviados nas campanhas de broadcast
 * (WhatsApp/Instagram precisam de URL pública para baixar a mídia).
 */
export const Route = createFileRoute("/api/public/broadcast-media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        let path = decodeURIComponent(params._splat ?? "");
        // Tolerância: quando o link é clicado a partir de um texto, o WhatsApp
        // costuma grudar o que vem depois da extensão (ex.: "|arquivo.png]]").
        // Cortamos tudo a partir da primeira extensão válida.
        const corte = path.match(/^(.+?\.[A-Za-z0-9]{2,5})(?:[|\]].*)?$/);
        if (corte) path = corte[1];
        if (!path || path.includes("..") || !/^[A-Za-z0-9/_-]+\.[A-Za-z0-9]{2,5}$/.test(path)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(await data.arrayBuffer(), {
          headers: {
            "Content-Type": data.type || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
