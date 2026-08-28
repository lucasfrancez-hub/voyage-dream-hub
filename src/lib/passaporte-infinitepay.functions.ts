import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ConfirmacaoResultado, PassportPaymentRow } from "./passaporte-pagamento.types";

/** Cria (ou reaproveita) o checkout de cartão InfinitePay do passaporte. Valor definido no backend. */
export const criarCheckoutPassaporte = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(6).max(64) }).parse(input))
  .handler(async ({ data }): Promise<{ checkoutUrl: string; orderNsu: string; status: string }> => {
    const { obterCheckoutPassaporte } = await import("./passaporte-pagamento.server");
    return obterCheckoutPassaporte(data.token);
  });

/** Confirma o pagamento com a InfinitePay (server-to-server) após o retorno do checkout. */
export const confirmarCheckoutPassaporte = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(6).max(64),
        orderNsu: z.string().max(120).optional().nullable(),
        transactionNsu: z.string().max(120).optional().nullable(),
        slug: z.string().max(160).optional().nullable(),
        receiptUrl: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ConfirmacaoResultado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { confirmarPagamentoPassaporte } = await import("./passaporte-pagamento.server");

    const { data: reqRow } = await supabaseAdmin
      .from("passport_requests")
      .select("id")
      .eq("token", data.token)
      .maybeSingle();
    if (!reqRow) throw new Error("Solicitação não encontrada.");
    const requestId = (reqRow as Record<string, any>).id as string;

    let orderNsu = data.orderNsu ?? null;
    if (!orderNsu) {
      const { data: last } = await supabaseAdmin
        .from("passport_payments")
        .select("order_nsu")
        .eq("passport_request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      orderNsu = last ? ((last as Record<string, any>).order_nsu as string) : null;
    } else {
      // o order_nsu precisa pertencer a esta solicitação
      const { data: owned } = await supabaseAdmin
        .from("passport_payments")
        .select("id")
        .eq("order_nsu", orderNsu)
        .eq("passport_request_id", requestId)
        .maybeSingle();
      if (!owned) throw new Error("Cobrança não pertence a esta solicitação.");
    }
    if (!orderNsu) throw new Error("Nenhuma cobrança encontrada para esta solicitação.");

    return confirmarPagamentoPassaporte({
      orderNsu,
      transactionNsu: data.transactionNsu ?? null,
      slug: data.slug ?? null,
      receiptUrl: data.receiptUrl ?? null,
      origem: "retorno",
    });
  });

/** Pagamentos InfinitePay de uma solicitação (uso interno da equipe). */
export const listarPagamentosPassaporte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PassportPaymentRow[]> => {
    const { mapPassportPayment } = await import("./passaporte-pagamento.server");
    const { data: rows, error } = await context.supabase
      .from("passport_payments")
      .select("*")
      .eq("passport_request_id", data.requestId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => mapPassportPayment(r as Record<string, any>));
  });
