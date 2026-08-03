import { createFileRoute } from "@tanstack/react-router";

/**
 * Manifest dinâmico do app de Agenda.
 * Precisa ser por token pra que "Adicionar à tela de início" abra
 * direto em /agenda/<token> e não na home do site.
 */
export const Route = createFileRoute("/api/public/agenda-manifest/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "").replace(/[^a-zA-Z0-9_-]/g, "");
        const base = `/agenda/${token}`;
        const manifest = {
          name: "Agenda VIA AIR",
          short_name: "Agenda",
          description: "Agenda unificada VIA AIR — Google, Titan e iCloud em um só lugar.",
          id: base,
          start_url: base,
          scope: base,
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait",
          lang: "pt-BR",
          background_color: "#080d1a",
          theme_color: "#080d1a",
          icons: [
            { src: "/agenda-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/agenda-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/agenda-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        };
        return new Response(JSON.stringify(manifest), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
