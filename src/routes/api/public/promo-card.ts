import { createFileRoute } from "@tanstack/react-router";
import { renderPromoCardHtml } from "@/lib/promo-card/card-html";
import type { PromoCardData, PromoCardFormat } from "@/lib/promo-card/card-data";

function decode(d: string): PromoCardData | null {
  try {
    const b64 = d.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json) as PromoCardData;
  } catch {
    return null;
  }
}

/**
 * Renderiza o card aprovado (Feed 4:5 ou Story 9:16) em HTML. É esta página
 * que o Browserless fotografa e que o admin usa como preview no iframe.
 */
export const Route = createFileRoute("/api/public/promo-card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const data = decode(url.searchParams.get("d") ?? "");
        if (!data) return new Response("Dados inválidos", { status: 400 });
        const format: PromoCardFormat = url.searchParams.get("f") === "story" ? "story" : "feed";
        const base = `${url.protocol}//${url.host}`;
        return new Response(renderPromoCardHtml(data, format, base), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=120",
          },
        });
      },
    },
  },
});
