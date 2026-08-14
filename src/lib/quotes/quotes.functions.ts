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

    // Não revoga os tokens ativos: a extensão já instalada continua funcionando
    // mesmo que alguém gere um token novo. Mantém no máximo 5 ativos por usuário.
    const { data: ativos } = await supabaseAdmin
      .from("extension_tokens")
      .select("id")
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    const excedentes = (ativos ?? []).slice(4).map((t) => t.id);
    if (excedentes.length) {
      await supabaseAdmin
        .from("extension_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .in("id", excedentes);
    }

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
  .inputValidator((i: { quoteId: string; optionNumber?: number }) =>
    z.object({ quoteId: z.string().uuid(), optionNumber: z.number().int().positive().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (!quote) throw new Error("Orçamento não encontrado");
    if (quote.converted_order_id) return { orderId: quote.converted_order_id, alreadyConverted: true };

    const normalized = quote.normalized as unknown as import("./types").NormalizedQuote | null;
    const escolhida =
      data.optionNumber && normalized?.options?.length
        ? (normalized.options.find((o) => o.optionNumber === data.optionNumber) ?? null)
        : null;
    const totalEscolhido = escolhida?.total ?? quote.total ?? 0;

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        full_name: quote.client_name ?? "Cliente",
        email: quote.client_email ?? null,
        phone: quote.client_phone ?? null,
        total_price: totalEscolhido,
        status: "pending",
        owner_user_id: quote.owner_user_id ?? context.userId,
        supplier_name: quote.source === "INFOTRAVEL" ? "Infotravel" : null,
        payment_method: "pix",
        package_snapshot: ((escolhida ?? quote.normalized) ?? {}) as never,
      })
      .select("id")
      .single();
    if (error || !order) throw new Error(error?.message ?? "Falha ao criar pedido");

    await supabaseAdmin
      .from("quotes")
      .update({
        status: "CONVERTED",
        converted_order_id: order.id,
        converted_option_number: escolhida?.optionNumber ?? null,
        updated_at: new Date().toISOString(),
      } as never)
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
    const LIBERADOS = ["READY", "SENT", "VIEWED", "INTERESTED", "CONVERTED"];
    if (!LIBERADOS.includes(String(quote.status))) {
      throw new Error("Importação incompleta: reprocesse o orçamento antes de gerar o link");
    }
    if (quote.public_url) return { url: quote.public_url, shortUrl: quote.public_short_url ?? null, reused: true };

    const normalized = quote.normalized as unknown as import("./types").NormalizedQuote;
    if (!normalized?.options?.length) throw new Error("Orçamento ainda não foi processado");
    const { optionHasProducts } = await import("./types");
    if (!normalized.options.some((o) => optionHasProducts(o)) || !(Number(quote.total) > 0)) {
      throw new Error("Orçamento sem produtos/valores reais: reprocesse a importação");
    }


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

/** Cria um orçamento manual (sem importação), com uma ou mais opções. */
export const criarOrcamentoManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        title: z.string().trim().min(2).max(160),
        clientName: z.string().trim().max(120).optional().nullable(),
        clientPhone: z.string().trim().max(40).optional().nullable(),
        clientEmail: z.string().trim().max(160).optional().nullable(),
        origin: z.string().trim().max(80).optional().nullable(),
        destination: z.string().trim().max(120).optional().nullable(),
        startDate: z.string().trim().max(10).optional().nullable(),
        endDate: z.string().trim().max(10).optional().nullable(),
        adults: z.number().int().min(1).max(20).optional(),
        children: z.number().int().min(0).max(20).optional(),
        consultant: z.string().trim().max(120).optional().nullable(),
        options: z
          .array(
            z.object({
              label: z.string().trim().max(80).optional().nullable(),
              total: z.number().min(0),
              hotelName: z.string().trim().max(160).optional().nullable(),
              services: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
              notes: z.string().trim().max(1000).optional().nullable(),
            }),
          )
          .min(1)
          .max(6),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emptyQuote, emptyOption } = await import("./types");
    const { syncQuoteOptions } = await import("./import.server");

    const normalized = emptyQuote("MANUAL");
    normalized.title = data.title;
    normalized.origin = data.origin ?? null;
    normalized.destination = data.destination ?? null;
    normalized.startDate = data.startDate ?? null;
    normalized.endDate = data.endDate ?? null;
    normalized.currency = "BRL";
    normalized.agent = data.consultant ?? null;
    normalized.client = {
      name: data.clientName ?? null,
      phone: data.clientPhone ?? null,
      email: data.clientEmail ?? null,
    };
    normalized.passengers = { adults: data.adults ?? 1, children: data.children ?? 0, infants: 0 };

    normalized.options = data.options.map((o, idx) => {
      const opt = emptyOption(idx + 1);
      opt.label = o.label?.trim() || `Opção ${idx + 1}`;
      opt.total = o.total;
      opt.currency = "BRL";
      opt.startDate = data.startDate ?? null;
      opt.endDate = data.endDate ?? null;
      opt.destination = data.destination ?? null;
      opt.notes = o.notes ? [o.notes] : null;
      if (o.hotelName) {
        opt.hotels = [
          {
            name: o.hotelName,
            city: data.destination ?? null,
            checkin: data.startDate ?? null,
            checkout: data.endDate ?? null,
          },
        ];
      }
      opt.services = (o.services ?? []).map((s) => ({ name: s }));
      return opt;
    });

    const total = normalized.options[0]?.total ?? null;
    const { data: created, error } = await supabaseAdmin
      .from("quotes")
      .insert({
        quote_type: "TRIP_PACKAGE",
        status: "READY",
        title: data.title,
        client_name: data.clientName ?? null,
        client_phone: data.clientPhone ?? null,
        client_email: data.clientEmail ?? null,
        origin: data.origin ?? null,
        destination: data.destination ?? null,
        start_date: data.startDate || null,
        end_date: data.endDate || null,
        total,
        currency: "BRL",
        consultant: data.consultant ?? null,
        source: "MANUAL",
        normalized: normalized as unknown as never,
        owner_user_id: context.userId,
        options_count: normalized.options.length,
      } as never)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao criar orçamento");

    await syncQuoteOptions(created.id, normalized);
    return { quoteId: created.id };
  });
