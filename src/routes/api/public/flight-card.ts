import { createFileRoute } from "@tanstack/react-router";
import { renderFlightCardHtml, type FlightCardData } from "@/lib/flight-card/card-html";

function decode(d: string): FlightCardData | null {
  try {
    const b64 = d.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json) as FlightCardData;
  } catch {
    return null;
  }
}

/**
 * Renderiza o cartão de voo em HTML. É essa página que o Browserless
 * fotografa para gerar a arte enviada no WhatsApp — e serve de preview.
 */
export const Route = createFileRoute("/api/public/flight-card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const data = decode(url.searchParams.get("d") ?? "");
        if (!data) return new Response("Dados inválidos", { status: 400 });
        const base = `${url.protocol}//${url.host}`;
        return new Response(renderFlightCardHtml(data, base), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
