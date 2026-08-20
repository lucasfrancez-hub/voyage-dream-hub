/**
 * Registra na esteira interna (/admin/orcamentos) os orçamentos gerados pela
 * IA (Bruno e Paula) a partir de uma pesquisa aérea.
 *
 * Uma pesquisa = UM orçamento com até 3 opções = UM link público. Aqui o
 * mesmo conteúdo vira uma linha em `quotes` para o time acompanhar.
 *
 * SERVER-ONLY.
 */
import type { NormalizedFlight, NormalizedOption, NormalizedQuote, QuoteSource } from "./types";
import { emptyOption } from "./types";
import type { FlightQuoteLeg, FlightQuoteOption, FlightQuoteResult } from "@/lib/whatsapp/flight-quote.server";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

/**
 * Constrói os segmentos reais do trecho.
 *
 * Antes o trecho inteiro virava UM segmento, então os orçamentos nunca
 * mostravam a conexão. Agora usamos `trechos` (detalhe vindo da operadora) e,
 * quando a cotação é antiga e só tem `escalas` ("GRU (1h10)"), reconstruímos a
 * cadeia de aeroportos para pelo menos exibir onde é a conexão.
 */
function toSegments(leg: FlightQuoteLeg): NormalizedFlight["segments"] {
  const bagagem = leg.bagagem_despachada ? "1 bagagem despachada" : null;

  if (leg.trechos?.length) {
    return leg.trechos.map((t) => ({
      airline: t.cia ?? leg.cia ?? null,
      airlineIata: t.ciaIata ?? null,
      flightNumber: t.voo ?? null,
      fromIata: t.origem ?? null,
      toIata: t.destino ?? null,
      departure: t.partida ?? null,
      arrival: t.chegada ?? null,
      duration: null,
      baggage: bagagem,
    }));
  }

  const escalas = (leg.escalas ?? [])
    .map((e) => String(e).match(/[A-Z]{3}/)?.[0] ?? null)
    .filter((x): x is string => Boolean(x));

  if (escalas.length) {
    const pontos = [leg.origem, ...escalas, leg.destino];
    return pontos.slice(0, -1).map((de, i) => ({
      airline: leg.cia ?? null,
      airlineIata: null,
      flightNumber: i === 0 ? (leg.voo ?? null) : null,
      fromIata: de ?? null,
      toIata: pontos[i + 1] ?? null,
      departure: i === 0 ? (leg.partida ?? null) : null,
      arrival: i === pontos.length - 2 ? (leg.chegada ?? null) : null,
      duration: null,
      baggage: bagagem,
    }));
  }

  return [
    {
      airline: leg.cia ?? null,
      airlineIata: leg.cia ?? null,
      flightNumber: leg.voo ?? null,
      fromIata: leg.origem ?? null,
      toIata: leg.destino ?? null,
      departure: leg.partida ?? null,
      arrival: leg.chegada ?? null,
      duration: leg.duracao ?? null,
      baggage: bagagem,
    },
  ];
}

function toFlight(leg: FlightQuoteLeg, direction: "OUTBOUND" | "INBOUND"): NormalizedFlight {
  return {
    direction,
    airline: leg.cia ?? null,
    fromIata: leg.origem ?? null,
    toIata: leg.destino ?? null,
    departure: leg.partida ?? null,
    arrival: leg.chegada ?? null,
    duration: leg.duracao ?? null,
    stops: Number(leg.paradas) || 0,
    segments: toSegments(leg),
  };
}


function toOption(op: FlightQuoteOption, numero: number, result: FlightQuoteResult): NormalizedOption {
  const base = emptyOption(numero);
  const flights = [toFlight(op.ida, "OUTBOUND")];
  if (op.volta) flights.push(toFlight(op.volta, "INBOUND"));
  return {
    ...base,
    label: `Opção ${numero}${op.destaque ? ` — ${op.destaque}` : ""}`,
    startDate: result.data_ida ?? null,
    endDate: result.data_volta ?? null,
    destination: result.destino_nome ?? result.destino_iata ?? null,
    flights,
    total: Number(op.total) || null,
    currency: "BRL",
  };
}

/**
 * Cria/atualiza a linha em `quotes` correspondente à cotação aérea da IA.
 * Idempotente por `fingerprint` (wa_flight_quotes.id).
 */
export async function registrarOrcamentoDaPesquisa(params: {
  result: FlightQuoteResult;
  options: FlightQuoteOption[];
  flightQuoteId: string;
  agentName?: string | null;
  agentSlug?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  publicQuoteId?: string | null;
  publicUrl?: string | null;
  publicShortUrl?: string | null;
}): Promise<string | null> {
  try {
    const supabase = await db();
    const { result } = params;
    const opts = params.options.filter(Boolean);
    if (!opts.length) return null;

    const slug = (params.agentSlug ?? "").toLowerCase();
    const source: QuoteSource = slug.includes("bruno") ? "BRUNO" : slug.includes("paula") ? "PAULA" : "MANUAL";

    const origem = result.origem_nome ?? result.origem_iata ?? null;
    const destino = result.destino_nome ?? result.destino_iata ?? null;

    const normalized: NormalizedQuote = {
      source,
      sourceId: params.flightQuoteId,
      title: `${origem ?? "?"} → ${destino ?? "?"}`,
      agent: params.agentName ?? null,
      client: { name: params.clientName ?? null, phone: params.clientPhone ?? null, email: null },
      passengers: {
        adults: result.passageiros?.adultos ?? 1,
        children: result.passageiros?.criancas ?? 0,
        infants: result.passageiros?.bebes ?? 0,
      },
      startDate: result.data_ida ?? null,
      endDate: result.data_volta ?? null,
      origin: origem,
      destination: destino,
      hotels: [],
      flights: [],
      cars: [],
      transfers: [],
      activities: [],
      tickets: [],
      insurance: [],
      services: [],
      options: opts.map((o, i) => toOption(o, i + 1, result)),
      total: Number(opts[0]!.total) || null,
      currency: "BRL",
    };
    normalized.flights = normalized.options[0]!.flights;

    const payload = {
      quote_type: "AIR_ONLY",
      status: "SENT",
      title: normalized.title ?? null,
      client_name: normalized.client?.name ?? null,
      client_phone: normalized.client?.phone ?? null,
      origin: origem,
      destination: destino,
      start_date: result.data_ida ?? null,
      end_date: result.data_volta ?? null,
      total: normalized.total,
      currency: "BRL",
      consultant: params.agentName ?? null,
      source,
      normalized: normalized as unknown as never,
      fingerprint: `wa_flight_quote:${params.flightQuoteId}`,
      options_count: normalized.options.length,
      public_quote_id: params.publicQuoteId ?? null,
      public_url: params.publicUrl ?? null,
      public_short_url: params.publicShortUrl ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: existente } = await supabase
      .from("quotes")
      .select("id")
      .eq("fingerprint", payload.fingerprint)
      .maybeSingle();

    let quoteId = (existente?.id as string | undefined) ?? null;
    if (quoteId) {
      await supabase.from("quotes").update(payload as never).eq("id", quoteId);
    } else {
      const { data: created } = await supabase
        .from("quotes")
        .insert(payload as never)
        .select("id")
        .single();
      quoteId = (created?.id as string | undefined) ?? null;
    }
    if (!quoteId) return null;

    const { syncQuoteOptions } = await import("./import.server");
    await syncQuoteOptions(quoteId, normalized).catch(() => {});
    return quoteId;
  } catch (e) {
    console.error("[quotes] falha ao registrar orçamento da IA:", e);
    return null;
  }
}
