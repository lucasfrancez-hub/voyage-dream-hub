/**
 * GET /api/public/internal/v1/orders/{orderId}/documents
 * Documentos do pedido (vouchers, PDFs) com link temporário.
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

          const { data } = await supabaseAdmin
            .from("order_documents")
            .select("id,name,file_path,created_at")
            .eq("order_id", linha.viaair_order_id);
          const docs = (data ?? []) as Array<Record<string, unknown>>;
          const saida = [] as Array<Record<string, unknown>>;
          for (const d of docs) {
            const caminho = String(d["file_path"] ?? "");
            let url: string | null = null;
            if (caminho) {
              const { data: assinado } = await supabaseAdmin.storage
                .from("order-documents")
                .createSignedUrl(caminho, 900);
              url = assinado?.signedUrl ?? null;
            }
            saida.push({ id: d["id"], name: d["name"], url, expiresInSeconds: 900 });
          }
          return ok({ orderId: linha.id, documents: saida }, ctx.correlationId);
        }),
    },
  },
});
