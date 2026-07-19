import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://pedidos.viaair.tur.br";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
  lastmod?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/pacotes", changefreq: "daily", priority: "0.9" },
          { path: "/minhas-reservas", changefreq: "weekly", priority: "0.5" },
          { path: "/politica-de-privacidade", changefreq: "yearly", priority: "0.3" },
          { path: "/termos-de-uso", changefreq: "yearly", priority: "0.3" },
          { path: "/exclusao-de-dados", changefreq: "yearly", priority: "0.3" },
        ];

        const entries: SitemapEntry[] = [...staticEntries];

        // Pacotes públicos publicados (rota dinâmica /pacotes/$slug)
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("packages")
            .select("slug, updated_at, is_published")
            .eq("is_published", true);
          for (const row of data ?? []) {
            if (!row.slug) continue;
            entries.push({
              path: `/pacotes/${row.slug}`,
              changefreq: "weekly",
              priority: "0.8",
              lastmod: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
            });
          }
        } catch (err) {
          console.error("[sitemap] erro ao listar pacotes:", err);
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
