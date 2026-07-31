/**
 * Rota de diagnóstico interno: simula a IA cotando aéreo (mesma engine do chatbot).
 * Uso: GET /api/debug-quote?origem=Maringa&destino=Sao%20Paulo&data_ida=2026-09-10
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug-quote")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams;
        const t0 = Date.now();
        try {
          const { quoteFlights } = await import("@/lib/whatsapp/flight-quote.server");
          const res = await quoteFlights({
            origem: q.get("origem") ?? "Curitiba",
            destino: q.get("destino") ?? "Sao Paulo",
            data_ida: q.get("data_ida") ?? "2026-09-10",
            data_volta: q.get("data_volta"),
            adultos: Number(q.get("adultos") ?? 1),
            bagagem_despachada: q.get("bagagem") === "1",
          });
          let card: unknown = null;
          if (q.get("card") === "1" && "opcoes" in (res as any) && (res as any).opcoes?.length) {
            try {
              const { buildFlightCardData, renderFlightCardImage } = await import(
                "@/lib/whatsapp/flight-card.server"
              );
              const data = buildFlightCardData(res as any, (res as any).opcoes[0]);
              card = await renderFlightCardImage(data);
            } catch (e) {
              card = { erro: e instanceof Error ? e.message : String(e) };
            }
          }
          return Response.json({ ok: true, ms: Date.now() - t0, card, res });
        } catch (err) {
          return Response.json({
            ok: false,
            ms: Date.now() - t0,
            error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
          });
        }
      },
    },
  },
});
