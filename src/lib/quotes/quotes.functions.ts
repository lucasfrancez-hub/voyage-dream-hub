import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Gera um token permanente para a extensão "Via Air Orçamentos". */
export const gerarTokenExtensao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { label?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");

    await supabaseAdmin
      .from("extension_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("revoked_at", null);

    const { error } = await supabaseAdmin.from("extension_tokens").insert({
      user_id: context.userId,
      token_hash: hash,
      label: data.label ?? "Via Air Orçamentos",
    });
    if (error) throw new Error(error.message);
    return { token };
  });

/** Importação manual (fallback) de um orçamento por URL. */
export const importarOrcamentoPorUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { url: string }) => z.object({ url: z.string().min(10).max(2000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { createQuoteImport, processQuoteImport, getImportStatus } = await import("./import.server");
    const created = await createQuoteImport({
      sourceUrl: data.url,
      browserExtension: false,
      userId: context.userId,
    });
    if (!created.importId) throw new Error(created.error ?? "URL de orçamento não reconhecida");
    await processQuoteImport(created.importId);
    const st = await getImportStatus(created.importId);
    return {
      importId: created.importId,
      status: st?.status ?? "PROCESSING",
      quoteId: st?.quote_id ?? null,
      error: st?.error ?? null,
    };
  });

/** Reprocessa uma importação existente (parser atualizado / erro anterior). */
export const reprocessarImportacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { importId: string }) => z.object({ importId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { processQuoteImport } = await import("./import.server");
    return await processQuoteImport(data.importId);
  });

/** Converte um orçamento em pedido, mantendo o orçamento com status Convertido. */
export const converterOrcamentoEmPedido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string }) => z.object({ quoteId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (!quote) throw new Error("Orçamento não encontrado");
    if (quote.converted_order_id) return { orderId: quote.converted_order_id, alreadyConverted: true };

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        full_name: quote.client_name ?? "Cliente",
        email: quote.client_email ?? null,
        phone: quote.client_phone ?? null,
        total_price: quote.total ?? 0,
        status: "pending",
        owner_user_id: quote.owner_user_id ?? context.userId,
        supplier_name: quote.source === "INFOTRAVEL" ? "Infotravel" : null,
        payment_method: "pix",
        package_snapshot: (quote.normalized ?? {}) as never,
      })
      .select("id")
      .single();
    if (error || !order) throw new Error(error?.message ?? "Falha ao criar pedido");

    await supabaseAdmin
      .from("quotes")
      .update({ status: "CONVERTED", converted_order_id: order.id, updated_at: new Date().toISOString() })
      .eq("id", quote.id);

    return { orderId: order.id, alreadyConverted: false };
  });

/** Gera (ou reaproveita) o link público oficial do orçamento, com todas as opções. */
export const gerarLinkOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string }) => z.object({ quoteId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildPublicQuoteFromImported } = await import("./to-public-quote.server");
    const { savePublicQuote } = await import("@/lib/public-quote/store.server");

    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (!quote) throw new Error("Orçamento não encontrado");
    if (quote.public_url) return { url: quote.public_url, shortUrl: quote.public_short_url ?? null, reused: true };

    const normalized = quote.normalized as unknown as import("./types").NormalizedQuote;
    if (!normalized?.options?.length) throw new Error("Orçamento ainda não foi processado");

    const dto = buildPublicQuoteFromImported({
      normalized,
      title: quote.title,
      clientName: quote.client_name,
      agentName: quote.consultant,
    });
    const saved = await savePublicQuote(dto as never);

    await supabaseAdmin
      .from("quotes")
      .update({
        public_url: saved.url,
        public_short_url: saved.shortUrl,
        public_quote_id: saved.quote.publicId,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", quote.id);

    return { url: saved.url, shortUrl: saved.shortUrl, reused: false };
  });
