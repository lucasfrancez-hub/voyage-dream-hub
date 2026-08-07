import { createFileRoute } from "@tanstack/react-router";

/**
 * Manifest dinâmico do app do Admin.
 * Por token, pra que "Adicionar à tela de início" abra direto no
 * /admin/app/<token> (PIN) e nunca na home do site (pacotes prontos).
 */
export const Route = createFileRoute("/api/public/admin-manifest/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "").replace(/[^a-zA-Z0-9_-]/g, "");
        const manifest = {
          name: "VIA AIR Admin",
          short_name: "Admin",
          description: "Painel Admin da VIA AIR — pedidos, pacotes e financeiro.",
          id: `/admin/app/${token}`,
          start_url: `/admin/app/${token}`,
          scope: "/admin",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "any",
          lang: "pt-BR",
          background_color: "#0F172A",
          theme_color: "#0F172A",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
