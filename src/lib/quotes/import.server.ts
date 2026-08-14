/**
 * Pipeline de importação de orçamentos (plugin Via Air Orçamentos e fallback manual).
 * SERVER-ONLY.
 */
import { parserFor, extractInfotravelUrl } from "./infotravel-parser.server";
import {
  emptyOption,
  emptyQuote,
  optionProductKinds,
  type NormalizedOption,
  type NormalizedQuote,
} from "./types";

export type ImportResult = {
  importId: string;
  quoteId?: string | null;
  status: "PROCESSING" | "READY" | "DUPLICATE" | "IMPORT_ERROR";
  duplicate?: boolean;
  version?: number;
  error?: string;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function normalizeSourceUrl(raw: string): string | null {
  const direct = extractInfotravelUrl(raw);
  if (direct) return direct;
  try {
    const u = new URL(raw);
    // link de compartilhamento do WhatsApp: o orçamento está no parâmetro text
    const text = u.searchParams.get("text") ?? u.searchParams.get("body");
    if (text) {
      const inner = extractInfotravelUrl(text);
      if (inner) return inner;
    }
    return u.hostname.includes("infotravel.com.br") ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function fingerprintFor(source: string, url: string): Promise<string> {
  let key = url;
  try {
    const u = new URL(url);
    key = `${u.hostname}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    /* usa a url crua */
  }
  const bytes = new TextEncoder().encode(`${source}|${key}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cria (ou reaproveita) o registro de importação. Idempotente por fingerprint. */
export async function createQuoteImport(input: {
  sourceUrl: string;
  source?: string;
  detectedAt?: string | null;
  browserExtension?: boolean;
  userId?: string | null;
}): Promise<ImportResult> {
  const supabase = await db();
  const source = input.source ?? "INFOTRAVEL";
  const url = normalizeSourceUrl(input.sourceUrl);
  if (!url) return { importId: "", status: "IMPORT_ERROR", error: "URL de orçamento não reconhecida" };

  const fingerprint = await fingerprintFor(source, url);

  const { data: existing } = await supabase
    .from("quote_imports")
    .select("id, status, quote_id, version")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing) {
    // reprocessa (nova versão) sem criar orçamento duplicado
    await supabase
      .from("quote_imports")
      .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return {
      importId: existing.id,
      quoteId: existing.quote_id,
      status: "PROCESSING",
      duplicate: true,
      version: existing.version,
    };
  }

  const { data, error } = await supabase
    .from("quote_imports")
    .insert({
      source,
      source_url: url,
      fingerprint,
      status: "PROCESSING",
      browser_extension: input.browserExtension ?? true,
      detected_at: input.detectedAt ?? new Date().toISOString(),
      created_by: input.userId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return { importId: "", status: "IMPORT_ERROR", error: error?.message ?? "insert_failed" };
  return { importId: data.id, status: "PROCESSING" };
}

/** Regrava as opções do orçamento (uma linha por opção comercial). */
export async function syncQuoteOptions(quoteId: string, normalized: NormalizedQuote): Promise<void> {
  const supabase = await db();
  await supabase.from("quote_options").delete().eq("quote_id", quoteId);
  const rows = normalized.options.map((o: NormalizedOption) => ({
    quote_id: quoteId,
    option_number: o.optionNumber,
    label: o.label ?? `Opção ${o.optionNumber}`,
    start_date: o.startDate ?? null,
    end_date: o.endDate ?? null,
    destination: o.destination ?? null,
    hotel_name: o.hotels[0]?.name ?? null,
    product_kinds: optionProductKinds(o),
    total: o.total ?? null,
    currency: o.currency ?? normalized.currency ?? "BRL",
    payment_conditions: (o.paymentConditions ?? []) as unknown as never,
    normalized: o as unknown as never,
    source_reference: o.sourceReference ?? normalized.sourceBookingId ?? null,
  }));
  if (rows.length) await supabase.from("quote_options").insert(rows as never);
}

/** Busca o HTML, interpreta, normaliza e cria/atualiza o Quote. */
export async function processQuoteImport(importId: string): Promise<ImportResult> {
  const supabase = await db();
  const { data: imp } = await supabase
    .from("quote_imports")
    .select("id, source, source_url, fingerprint, quote_id, version, created_by")
    .eq("id", importId)
    .maybeSingle();
  if (!imp) return { importId, status: "IMPORT_ERROR", error: "import_not_found" };

  const fail = async (msg: string) => {
    await supabase
      .from("quote_imports")
      .update({ status: "IMPORT_ERROR", error: msg.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", importId);
    return { importId, status: "IMPORT_ERROR" as const, error: msg };
  };

  let html = "";
  let httpStatus = 0;
  try {
    const res = await fetch(imp.source_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });
    httpStatus = res.status;
    html = await res.text();
  } catch (e) {
    return await fail(`fetch: ${(e as Error).message}`);
  }
  if (httpStatus >= 400 || !html) return await fail(`http_${httpStatus}`);

  const parser = parserFor(imp.source_url);
  let normalized: NormalizedQuote;
  try {
    normalized = parser ? parser.parse(html, imp.source_url) : emptyQuote("IMPORTADO");
  } catch (e) {
    return await fail(`parser: ${(e as Error).message}`);
  }
  normalized.sourceUrl = imp.source_url;
  if (!normalized.options.length) {
    const only = emptyOption(1);
    only.label = "Opção 1";
    only.hotels = normalized.hotels;
    only.flights = normalized.flights;
    only.cars = normalized.cars;
    only.transfers = normalized.transfers;
    only.activities = normalized.activities;
    only.tickets = normalized.tickets;
    only.insurance = normalized.insurance;
    only.services = normalized.services;
    only.total = normalized.total ?? null;
    only.startDate = normalized.startDate ?? null;
    only.endDate = normalized.endDate ?? null;
    only.destination = normalized.destination ?? null;
    normalized.options = [only];
  }

  const kindsAllOptions = normalized.options.flatMap((o) => optionProductKinds(o));
  const hasAir = kindsAllOptions.includes("flights");
  const hasOther = kindsAllOptions.some((k) => k !== "flights");
  const quoteType = hasAir && !hasOther ? "AIR_ONLY" : "TRIP_PACKAGE";

  const first = normalized.options[0]!;
  const payload = {
    quote_type: quoteType,
    status: "READY",
    title: normalized.title ?? normalized.destination ?? "Orçamento importado",
    client_name: normalized.client?.name ?? null,
    client_phone: normalized.client?.phone ?? null,
    client_email: normalized.client?.email ?? null,
    origin: normalized.origin ?? null,
    destination: normalized.destination ?? first.destination ?? null,
    start_date: normalized.startDate ?? first.startDate ?? null,
    end_date: normalized.endDate ?? first.endDate ?? null,
    total: normalized.total ?? first.total ?? null,
    currency: normalized.currency ?? "BRL",
    consultant: normalized.agent ?? null,
    source: imp.source,
    normalized: normalized as unknown as never,
    source_import_id: imp.id,
    owner_user_id: imp.created_by,
    fingerprint: imp.fingerprint,
    source_booking_id: normalized.sourceBookingId ?? normalized.sourceId ?? null,
    source_booking_index: normalized.sourceBookingIndex ?? null,
    source_company_code: normalized.sourceCompanyCode ?? null,
    source_token: normalized.sourceToken ?? null,
    options_count: normalized.options.length,
    updated_at: new Date().toISOString(),
  };

  let quoteId = imp.quote_id as string | null;
  let version = imp.version ?? 1;
  if (quoteId) {
    version = version + 1;
    await supabase
      .from("quotes")
      .update({ ...payload, version })
      .eq("id", quoteId);
  } else {
    const { data: created, error } = await supabase.from("quotes").insert(payload).select("id").single();
    if (error || !created) return await fail(`quote_insert: ${error?.message ?? "unknown"}`);
    quoteId = created.id;
  }

  await syncQuoteOptions(quoteId!, normalized);


  await supabase
    .from("quote_imports")
    .update({
      status: "READY",
      http_status: httpStatus,
      source_html: html.slice(0, 900_000),
      parsed_payload: normalized as unknown as never,
      quote_id: quoteId,
      version,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importId);

  return { importId, quoteId, status: "READY", version };
}

export async function getImportStatus(importId: string) {
  const supabase = await db();
  const { data } = await supabase
    .from("quote_imports")
    .select("id, status, quote_id, error, updated_at, source_url")
    .eq("id", importId)
    .maybeSingle();
  if (!data) return null;
  let quote: { id: string; quote_number: number; title: string | null; destination: string | null } | null = null;
  if (data.quote_id) {
    const { data: q } = await supabase
      .from("quotes")
      .select("id, quote_number, title, destination")
      .eq("id", data.quote_id)
      .maybeSingle();
    quote = q ?? null;
  }
  return { ...data, quote };
}
