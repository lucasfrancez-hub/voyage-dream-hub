/**
 * GET /api/public/internal/v1/orders/{orderId}/documents
 * Documentos do pedido (vouchers, PDFs) com link temporário de 15 minutos.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withApi, ok, fail } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/internal/v1/orders/$orderId/documents")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApi(request, "orders:read", async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: op } = await supabaseAdmin
            .from("integration_orders")
            .select("id,viaair_order_id")
            .or(`id.eq.${params.orderId},viaair_order_id.eq.${params.orderId}`)
            .maybeSingle();
          const linha = op as { id: string; viaair_order_id: string | null } | null;
          if (!linha) return fail("not_found", "Pedido não encontrado.", ctx.correlationId);
          if (!linha.viaair_order_id) return ok({ orderId: linha.id, documents: [] }, ctx.correlationId);

          const { data: arquivos } = await supabaseAdmin.storage
            .from("order-documents")
            .list(linha.viaair_order_id, { limit: 100 });

          const documents: Array<Record<string, unknown>> = [];
          for (const f of arquivos ?? []) {
            if (!f.name || f.name.startsWith(".")) continue;
            const caminho = `${linha.viaair_order_id}/${f.name}`;
            const { data: assinado } = await supabaseAdmin.storage
              .from("order-documents")
              .createSignedUrl(caminho, 900);
            documents.push({
              name: f.name,
              url: assinado?.signedUrl ?? null,
              createdAt: f.created_at ?? null,
              expiresInSeconds: 900,
            });
          }
          return ok({ orderId: linha.id, documents }, ctx.correlationId);
        }),
    },
  },
});
