import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook InfinitePay — EXCLUSIVO do módulo de passaporte.
 * Nunca confia no payload: sempre confirma via payment_check server-to-server.
 */
export const Route = createFileRoute("/api/public/infinitepay-passaporte-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { logPagamento, confirmarPagamentoPassaporte } = await import(
          "@/lib/passaporte-pagamento.server"
        );

        let payload: Record<string, any> = {};
        try {
          payload = (await request.json()) as Record<string, any>;
        } catch {
          payload = {};
        }

        const orderNsu =
          payload?.order_nsu ?? payload?.orderNsu ?? payload?.data?.order_nsu ?? null;

        await logPagamento("infinitepay_webhook_received", { payload }, { orderNsu });

        if (!orderNsu || !String(orderNsu).startsWith("PASSAPORTE-")) {
          // Não pertence ao módulo de passaporte — ignora silenciosamente.
          return new Response(JSON.stringify({ ok: true, ignored: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const result = await confirmarPagamentoPassaporte({
            orderNsu: String(orderNsu),
            transactionNsu:
              payload?.transaction_nsu ?? payload?.transactionNsu ?? payload?.data?.transaction_nsu ?? null,
            slug: payload?.slug ?? payload?.invoice_slug ?? null,
            receiptUrl: payload?.receipt_url ?? null,
            origem: "webhook",
          });
          return new Response(JSON.stringify({ ok: true, status: result.status }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          await logPagamento(
            "infinitepay_webhook_error",
            { erro: e instanceof Error ? e.message : String(e) },
            { orderNsu },
          );
          return new Response(JSON.stringify({ ok: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
