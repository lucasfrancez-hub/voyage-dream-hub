/**
 * Edição manual dos itens de um orçamento (hospedagem, aéreo, serviços) e
 * leitura de documentos (PDF/imagem) por IA para virar item automaticamente.
 *
 * O orçamento guarda tudo dentro de `quotes.normalized` (NormalizedQuote), então
 * toda alteração aqui: carrega → muda a opção → recalcula totais → grava e
 * ressincroniza `quote_options`.
 *
 * SERVER-ONLY.
 */
import { emptyOption, type NormalizedFlight, type NormalizedGenericItem, type NormalizedHotel, type NormalizedOption, type NormalizedQuote } from "./types";
import { emptyQuote } from "./types";

export type ItemKind = "hotel" | "flight" | "service";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Soma dos produtos de uma opção. */
export function somaOpcao(opt: NormalizedOption): number {
  const genericos = [
    ...opt.services,
    ...opt.transfers,
    ...opt.activities,
    ...opt.tickets,
    ...opt.insurance,
    ...opt.cars,
  ];
  return (
    opt.hotels.reduce((a, h) => a + num(h.total), 0) +
    opt.flights.reduce((a, f) => a + num(f.total), 0) +
    genericos.reduce((a, s) => a + num(s.total), 0)
  );
}

/** Espelha a opção 1 nos campos de topo (compatibilidade com telas antigas). */
function espelharTopo(normalized: NormalizedQuote): void {
  const primeira = normalized.options[0];
  if (!primeira) return;
  normalized.hotels = primeira.hotels;
  normalized.flights = primeira.flights;
  normalized.cars = primeira.cars;
  normalized.transfers = primeira.transfers;
  normalized.activities = primeira.activities;
  normalized.tickets = primeira.tickets;
  normalized.insurance = primeira.insurance;
  normalized.services = primeira.services;
}

type QuoteRow = {
  id: string;
  normalized: unknown;
  source: string | null;
  total: number | null;
  title: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
};

/**
 * Carrega o orçamento, aplica a mutação na opção pedida e grava tudo de volta.
 * Recalcula o total da opção (soma dos itens) e o total do orçamento.
 */
export async function mutateQuoteOption(
  quoteId: string,
  optionNumber: number,
  mutate: (opt: NormalizedOption, normalized: NormalizedQuote) => void,
): Promise<{ total: number; optionTotal: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { syncQuoteOptions } = await import("./import.server");

  const { data: row, error } = await supabaseAdmin
    .from("quotes")
    .select("id, normalized, source, total, title, destination, start_date, end_date")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Orçamento não encontrado");
  const quote = row as unknown as QuoteRow;

  const normalized: NormalizedQuote =
    (quote.normalized as NormalizedQuote | null) ?? emptyQuote("MANUAL");
  if (!Array.isArray(normalized.options) || normalized.options.length === 0) {
    const base = emptyOption(1);
    base.label = "Opção 1";
    base.currency = normalized.currency ?? "BRL";
    base.destination = quote.destination ?? null;
    base.startDate = quote.start_date ?? null;
    base.endDate = quote.end_date ?? null;
    normalized.options = [base];
  }

  let opt = normalized.options.find((o) => o.optionNumber === optionNumber);
  if (!opt) {
    opt = emptyOption(optionNumber);
    opt.label = `Opção ${optionNumber}`;
    opt.currency = normalized.currency ?? "BRL";
    normalized.options.push(opt);
  }
  // Garante os arrays mesmo em orçamentos antigos gravados sem eles.
  opt.hotels ??= [];
  opt.flights ??= [];
  opt.services ??= [];
  opt.transfers ??= [];
  opt.activities ??= [];
  opt.tickets ??= [];
  opt.insurance ??= [];
  opt.cars ??= [];

  mutate(opt, normalized);

  const optionTotal = somaOpcao(opt);
  opt.total = optionTotal > 0 ? optionTotal : (opt.total ?? null);
  opt.currency ??= "BRL";
  normalized.options.sort((a, b) => a.optionNumber - b.optionNumber);
  espelharTopo(normalized);

  const totalOrcamento = Number(normalized.options[0]?.total ?? optionTotal ?? 0);
  normalized.total = totalOrcamento || null;

  const { error: upErr } = await supabaseAdmin
    .from("quotes")
    .update({
      normalized: normalized as unknown as never,
      total: totalOrcamento || null,
      options_count: normalized.options.length,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", quoteId);
  if (upErr) throw new Error(upErr.message);

  await syncQuoteOptions(quoteId, normalized);
  return { total: totalOrcamento, optionTotal };
}

/* ------------------------------------------------------------------ */
/* Leitura de documento por IA                                         */
/* ------------------------------------------------------------------ */

const PROMPT_ORCAMENTO = `Você lê UM documento de viagem (cotação, voucher, itinerário, e-mail impresso, print de tela) e devolve os itens que ele contém para um ORÇAMENTO.

REGRAS:
- Datas em "YYYY-MM-DD". Horários em ISO local "YYYY-MM-DDTHH:MM".
- Nunca invente dado que não esteja no documento; omita o campo se não souber.
- Valores em número puro (sem R$, sem separador de milhar). Se o documento traz tarifa + taxas, some no total do item e informe também tarifa/taxas quando aparecerem separadas.
- AÉREO: um item por sentido de viagem (ida e volta = 2 itens), cada um com TODOS os seus trechos em "segments" (conexões viram trechos). direction = "OUTBOUND" (ida) ou "INBOUND" (volta). from_iata/to_iata com 3 letras. flight_number com a sigla da cia quando houver.
- HOSPEDAGEM: um item por hotel, com check_in, check_out, noites, categoria do quarto e regime de alimentação.
- SERVIÇO: traslados, passeios, ingressos, seguro, aluguel de carro, bagagem, assento. Um item por serviço.
- Se o documento tem valor por passageiro e a quantidade de passageiros, informe o total do item já multiplicado quando o próprio documento apresentar esse total; caso contrário use o valor mostrado.
- Devolva também os passageiros quando o documento listar nomes.`;

const SCHEMA_ORCAMENTO = {
  type: "object",
  additionalProperties: false,
  properties: {
    hotels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          check_in: { type: "string" },
          check_out: { type: "string" },
          nights: { type: "number" },
          room: { type: "string" },
          board: { type: "string" },
          total: { type: "number" },
        },
        required: ["name"],
      },
    },
    flights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          direction: { type: "string", enum: ["OUTBOUND", "INBOUND"] },
          airline: { type: "string" },
          from_iata: { type: "string" },
          to_iata: { type: "string" },
          departure: { type: "string" },
          arrival: { type: "string" },
          duration: { type: "string" },
          stops: { type: "number" },
          fare: { type: "number" },
          taxes: { type: "number" },
          total: { type: "number" },
          segments: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                airline: { type: "string" },
                airline_iata: { type: "string" },
                flight_number: { type: "string" },
                from_iata: { type: "string" },
                to_iata: { type: "string" },
                departure: { type: "string" },
                arrival: { type: "string" },
                duration: { type: "string" },
                cabin: { type: "string" },
                baggage: { type: "string" },
              },
            },
          },
        },
      },
    },
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          date: { type: "string" },
          quantity: { type: "number" },
          total: { type: "number" },
        },
        required: ["name"],
      },
    },
    passengers: { type: "array", items: { type: "string" } },
  },
} as const;

export type ExtractedQuoteItems = {
  hotels: NormalizedHotel[];
  flights: NormalizedFlight[];
  services: NormalizedGenericItem[];
  passengers: string[];
};

type RawHotel = {
  name?: string; city?: string; address?: string; check_in?: string; check_out?: string;
  nights?: number; room?: string; board?: string; total?: number;
};
type RawSegment = {
  airline?: string; airline_iata?: string; flight_number?: string; from_iata?: string; to_iata?: string;
  departure?: string; arrival?: string; duration?: string; cabin?: string; baggage?: string;
};
type RawFlight = {
  direction?: "OUTBOUND" | "INBOUND"; airline?: string; from_iata?: string; to_iata?: string;
  departure?: string; arrival?: string; duration?: string; stops?: number;
  fare?: number; taxes?: number; total?: number; segments?: RawSegment[];
};
type RawService = { name?: string; description?: string; date?: string; quantity?: number; total?: number };
type RawResult = { hotels?: RawHotel[]; flights?: RawFlight[]; services?: RawService[]; passengers?: string[] };

function mapExtracted(raw: RawResult): ExtractedQuoteItems {
  const hotels: NormalizedHotel[] = (raw.hotels ?? [])
    .filter((h) => h?.name)
    .map((h) => ({
      name: String(h.name),
      city: h.city ?? null,
      address: h.address ?? null,
      checkin: h.check_in ?? null,
      checkout: h.check_out ?? null,
      nights: h.nights ?? null,
      roomDescription: h.room ?? null,
      board: h.board ?? null,
      total: h.total ?? null,
    }));

  const flights: NormalizedFlight[] = (raw.flights ?? []).map((f) => {
    const segments = (f.segments ?? []).map((s) => ({
      airline: s.airline ?? f.airline ?? null,
      airlineIata: s.airline_iata ?? null,
      flightNumber: s.flight_number ?? null,
      fromIata: s.from_iata ?? null,
      toIata: s.to_iata ?? null,
      departure: s.departure ?? null,
      arrival: s.arrival ?? null,
      duration: s.duration ?? null,
      cabin: s.cabin ?? null,
      baggage: s.baggage ?? null,
    }));
    const total = f.total ?? (f.fare != null || f.taxes != null ? num(f.fare) + num(f.taxes) : null);
    return {
      direction: f.direction ?? "OUTBOUND",
      airline: f.airline ?? segments[0]?.airline ?? null,
      fromIata: f.from_iata ?? segments[0]?.fromIata ?? null,
      toIata: f.to_iata ?? segments[segments.length - 1]?.toIata ?? null,
      departure: f.departure ?? segments[0]?.departure ?? null,
      arrival: f.arrival ?? segments[segments.length - 1]?.arrival ?? null,
      duration: f.duration ?? null,
      stops: f.stops ?? (segments.length > 1 ? segments.length - 1 : 0),
      segments,
      total,
    } satisfies NormalizedFlight;
  });

  const services: NormalizedGenericItem[] = (raw.services ?? [])
    .filter((s) => s?.name)
    .map((s) => ({
      name: String(s.name),
      description: s.description ?? null,
      date: s.date ?? null,
      quantity: s.quantity ?? null,
      total: s.total ?? null,
    }));

  return {
    hotels,
    flights,
    services,
    passengers: (raw.passengers ?? []).filter((p) => typeof p === "string" && p.trim().length > 1),
  };
}

/** Manda o arquivo pra IA e devolve itens já no formato do orçamento. */
export async function lerDocumentoOrcamento(input: {
  filename: string;
  mimeType: string;
  fileBase64: string;
  /** Quando informado, orienta a IA a priorizar esse tipo de item. */
  foco?: ItemKind | null;
}): Promise<ExtractedQuoteItems> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("IA indisponível no servidor (chave ausente)");

  const dataUrl = `data:${input.mimeType};base64,${input.fileBase64}`;
  const isImage = input.mimeType.startsWith("image/");
  const focoTexto =
    input.foco === "hotel"
      ? "O foco é HOSPEDAGEM, mas traga também aéreo e serviços se aparecerem."
      : input.foco === "flight"
        ? "O foco é AÉREO, mas traga também hospedagem e serviços se aparecerem."
        : input.foco === "service"
          ? "O foco é SERVIÇOS, mas traga também aéreo e hospedagem se aparecerem."
          : "Traga tudo que encontrar.";

  const body = {
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: PROMPT_ORCAMENTO },
      {
        role: "user",
        content: [
          { type: "text", text: `Extraia os itens deste documento para o orçamento. ${focoTexto}` },
          isImage
            ? { type: "image_url", image_url: { url: dataUrl } }
            : { type: "file", file: { filename: input.filename, file_data: dataUrl } },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "return_quote_items",
          description: "Itens de viagem extraídos do documento.",
          parameters: SCHEMA_ORCAMENTO,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "return_quote_items" } },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "custom-fetch",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const texto = await res.text();
    if (res.status === 429) throw new Error("A IA está ocupada agora. Tente de novo em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos para continuar.");
    throw new Error(`Falha ao ler o documento (${res.status}): ${texto.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }>; content?: string } }>;
  };
  const bruto =
    json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
    json.choices?.[0]?.message?.content ??
    "{}";
  let parsed: RawResult;
  try {
    parsed = JSON.parse(bruto) as RawResult;
  } catch {
    const m = bruto.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Não consegui interpretar a resposta da IA.");
    parsed = JSON.parse(m[0]) as RawResult;
  }
  return mapExtracted(parsed);
}
