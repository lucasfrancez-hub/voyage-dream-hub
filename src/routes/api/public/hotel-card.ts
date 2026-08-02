import { createFileRoute } from "@tanstack/react-router";
import { renderHotelCardHtml, type HotelCardData } from "@/lib/hotel-card/card-html";

function decode(d: string): HotelCardData | null {
  try {
    const b64 = d.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json) as HotelCardData;
  } catch {
    return null;
  }
}

/**
 * Renderiza o cartão de hotel em HTML — é essa página que o Browserless
 * fotografa para gerar a arte enviada no WhatsApp (e serve de preview).
 */
export const Route = createFileRoute("/api/public/hotel-card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const data = decode(url.searchParams.get("d") ?? "");
        if (!data) return new Response("Dados inválidos", { status: 400 });
        const base = `${url.protocol}//${url.host}`;
        return new Response(renderHotelCardHtml(data, base), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
