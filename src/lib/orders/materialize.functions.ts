import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Materializa os itens (hospedagem, aéreo, serviços) e o financeiro de um
 * pedido criado pelo checkout público do orçamento. Só funciona quando o
 * pedido foi realmente gerado pelo mesmo link de orçamento e ainda não tem
 * itens — nada é sobrescrito.
 */
export const materializarPedidoDaReserva = createServerFn({ method: "POST" })
  .inputValidator((i: { orderId: string; token: string }) =>
    z.object({ orderId: z.string().uuid(), token: z.string().min(4).max(64) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, total_price, package_snapshot")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { created: 0 };

    const snap = (order.package_snapshot ?? {}) as Record<string, unknown>;
    if (snap["quote_token"] !== data.token) return { created: 0 };

    const { getPublicQuoteByPublicId } = await import("@/lib/public-quote/store.server");
    const quote = await getPublicQuoteByPublicId(String(snap["quote_public_id"] ?? data.token));
    if (!quote) return { created: 0 };

    const { materializeOrderFromPublicQuote } = await import("./materialize-from-quote.server");
    const created = await materializeOrderFromPublicQuote(
      order.id,
      quote,
      Number(order.total_price ?? 0),
    );
    return { created };
  });
