/**
 * GET /api/public/internal/v1/payments/{paymentId}
 * Situação de uma cobrança Pix VIA AIR (Asaas) pelo txid.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { statusDoPagamento } from "@/lib/api/normalize";

export const Route = createFileRoute("/api/public/internal/v1/payments/$paymentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "payments:read", async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("pix_cobrancas")
            .select("txid,order_id,valor,status,expira_em,qr_code,created_at")
            .eq("txid", params.paymentId)
            .maybeSingle();
          const linha = data as {
            txid: string;
            order_id: string | null;
            valor: number;
            status: string | null;
            expira_em: string | null;
            qr_code: string | null;
            created_at: string;
          } | null;
          if (!linha) return fail("not_found", "Pagamento não encontrado.", ctx.correlationId);
          return ok(
            {
              paymentId: linha.txid,
              orderId: linha.order_id,
              amount: Number(linha.valor),
              currency: "BRL",
              status: statusDoPagamento(linha.status, linha.expira_em),
              qrCode: linha.qr_code,
              expiresAt: linha.expira_em,
              createdAt: linha.created_at,
              provider: "VIAAIR_ASAAS",
            },
            ctx.correlationId,
          );
        }),
    },
  },
});
