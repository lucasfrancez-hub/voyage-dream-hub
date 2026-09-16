/**
 * Orçamento público AIR_ONLY a partir de identificadores OPACOS da Internal API
 * (searchId + offerId). Reutiliza exatamente a mesma cadeia usada hoje pelo
 * WhatsApp: FlightQuoteResult/Option -> buildAirOnlyQuote -> savePublicQuote.
 *
 * Nenhuma chave do fornecedor (fareKey, searchKey, flightKey, itineraryId)
 * entra no retorno: elas só circulam internamente.
 *
 * SERVER-ONLY.
 */
import { cityLabel } from "@/lib/iata-lookup";
import type { ApiFlightOffer } from "@/lib/api/normalize";
import type { OfferPayload } from "@/lib/api/refs.server";
import type {
  FlightQuoteHop,
  FlightQuoteLeg,
  FlightQuoteOption,
  FlightQuoteResult,
} from "@/lib/whatsapp/flight-quote.server";

function stamp(iso: string | null): string {
  if (!iso) return "";
  return String(iso).replace("T", " ").slice(0, 16);
}

function minutos(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}Z`);
  return Number.isFinite(t) ? t / 60000 : null;
}

function duracao(min: number | null): string {
  if (!min || min <= 0) return "";
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

function hops(offer: ApiFlightOffer): FlightQuoteHop[] {
  return (offer.segments ?? []).map((s, i, arr) => {
    const prox = arr[i + 1];
    const a = minutos(s.arrivalAt);
    const b = prox ? minutos(prox.departureAt) : null;
    return {
      cia: s.airline?.name ?? null,
      ciaIata: s.airline?.iata ?? null,
      voo: s.flightNumber || null,
      origem: s.origin,
      destino: s.destination,
      partida: stamp(s.departureAt),
      chegada: stamp(s.arrivalAt),
      esperaMin: a != null && b != null ? Math.max(0, b - a) : null,
    };
  });
}

function escalas(offer: ApiFlightOffer): string[] {
  const segs = offer.segments ?? [];
  const out: string[] = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const a = minutos(segs[i]!.arrivalAt);
    const b = minutos(segs[i + 1]!.departureAt);
    const espera = a != null && b != null ? Math.max(0, b - a) : 0;
    out.push(`${segs[i]!.destination} (${Math.floor(espera / 60)}h${String(espera % 60).padStart(2, "0")})`);
  }
  return out;
}

function temBagagem(offer: ApiFlightOffer, fareIndex: number | null): boolean {
  const fares = offer.fares ?? [];
  if (fareIndex != null && fares[fareIndex]) return Boolean(fares[fareIndex]!.checkedBaggage);
  return fares.some((f) => f.checkedBaggage);
}

function toLeg(offer: ApiFlightOffer, fareIndex: number | null): FlightQuoteLeg {
  return {
    cia: offer.airline?.name ?? offer.airline?.iata ?? "—",
    voo: offer.flightNumber ?? "",
    origem: offer.origin,
    destino: offer.destination,
    partida: stamp(offer.departureAt),
    chegada: stamp(offer.arrivalAt),
    duracao: duracao(offer.durationMinutes),
    paradas: offer.stops ?? 0,
    escalas: escalas(offer),
    trechos: hops(offer),
    bagagem_despachada: temBagagem(offer, fareIndex),
  };
}

function totalDe(offer: ApiFlightOffer, fareIndex: number | null): number {
  const fare = fareIndex != null ? offer.fares?.[fareIndex] : null;
  return Number(fare?.total ?? offer.price?.total ?? 0) || 0;
}

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type QuoteOfferInput = {
  payload: OfferPayload;
  offer: ApiFlightOffer;
  fareIndex: number | null;
};

/** Monta o par (resultado, opção) no formato interno já usado pelo motor. */
export function montarCotacaoDaOferta(args: {
  outbound: QuoteOfferInput;
  inbound?: QuoteOfferInput | null;
}): { result: FlightQuoteResult; option: FlightQuoteOption } {
  const ctx = args.outbound.payload.contexto;
  const ida = toLeg(args.outbound.offer, args.outbound.fareIndex);
  const volta = args.inbound ? toLeg(args.inbound.offer, args.inbound.fareIndex) : null;

  const passageiros = Math.max(1, (ctx.adults ?? 1) + (ctx.children ?? 0));
  const total =
    totalDe(args.outbound.offer, args.outbound.fareIndex) +
    (args.inbound ? totalDe(args.inbound.offer, args.inbound.fareIndex) : 0);
  const porPessoa = total / passageiros;

  const option: FlightQuoteOption = {
    opcao: 1,
    destaque: "",
    total,
    total_formatado: money(total),
    por_pessoa: porPessoa,
    por_pessoa_formatado: money(porPessoa),
    passageiros,
    bagagem_despachada: ida.bagagem_despachada && (volta ? volta.bagagem_despachada : true),
    ida,
    volta,
    cart: {
      outboundFareId: args.outbound.payload.fareId,
      outboundItineraryId: args.outbound.payload.itineraryId,
      inboundFareId: args.inbound?.payload.fareId ?? null,
      inboundItineraryId: args.inbound?.payload.itineraryId ?? null,
    },
  };

  const result: FlightQuoteResult = {
    origem_iata: ida.origem || ctx.departureIata,
    destino_iata: ida.destino || ctx.arrivalIata,
    origem_nome: cityLabel(ida.origem || ctx.departureIata) || (ida.origem || ctx.departureIata),
    destino_nome: cityLabel(ida.destino || ctx.arrivalIata) || (ida.destino || ctx.arrivalIata),
    data_ida: ctx.departureDate,
    data_volta: volta ? (ctx.returnDate ?? null) : null,
    search_key: null,
    passageiros: { adultos: ctx.adults ?? 1, criancas: ctx.children ?? 0, bebes: ctx.infants ?? 0 },
    opcoes: [option],
    filtros: {
      somente_voo_direto: false,
      maximo_conexoes: 3,
      companhias_incluidas: [],
      companhias_excluidas: [],
      bagagem_despachada: option.bagagem_despachada,
      periodo_ida: "livre",
      periodo_volta: null,
    },
    observacao: "",
  };

  return { result, option };
}

/**
 * Persiste o orçamento público e devolve APENAS identificadores públicos.
 */
export async function criarOrcamentoAereoDaOferta(args: {
  outbound: QuoteOfferInput;
  inbound?: QuoteOfferInput | null;
  agentName?: string | null;
  conversationId?: string | null;
  validUntil?: string | null;
}): Promise<{ quote_id: string; public_id: string; public_url: string; short_url: string | null; total: number }> {
  const { result, option } = montarCotacaoDaOferta(args);
  const { buildAirOnlyQuote } = await import("@/lib/public-quote/from-flight.server");
  const { savePublicQuote } = await import("@/lib/public-quote/store.server");

  const dto = buildAirOnlyQuote({
    result,
    option,
    optionIndex: 1,
    agentName: args.agentName ?? null,
    conversationId: args.conversationId ?? null,
    flightQuoteId: null,
    validUntil: args.validUntil ?? null,
  });

  const { quote, url, shortUrl } = await savePublicQuote(dto as never);
  return {
    quote_id: quote.id,
    public_id: quote.publicId,
    public_url: url,
    short_url: shortUrl ?? null,
    total: option.total,
  };
}

/**
 * Várias ofertas (até 3) viram UM único orçamento público com seletor de
 * opções — exatamente a mesma estrutura já usada pelo portal
 * (buildAirOnlyMultiQuote). As opções são ordenadas do menor para o maior
 * total e cada uma preserva os seus próprios voos, tarifas e pagamento.
 */
export async function criarOrcamentoAereoMultiDaOferta(args: {
  opcoes: Array<{ outbound: QuoteOfferInput; inbound?: QuoteOfferInput | null }>;
  agentName?: string | null;
  conversationId?: string | null;
  validUntil?: string | null;
}): Promise<{
  quote_id: string;
  public_id: string;
  public_url: string;
  short_url: string | null;
  total: number;
  options: Array<{ option_number: number; total: number; currency: "BRL" }>;
}> {
  const montadas = args.opcoes.map((o) => montarCotacaoDaOferta(o));
  montadas.sort((a, b) => (Number(a.option.total) || 0) - (Number(b.option.total) || 0));

  const result = montadas[0]!.result;
  const options = montadas.map((m, i) => ({
    ...m.option,
    opcao: i + 1,
    cart: m.option.cart,
  }));
  result.opcoes = options;

  const { buildAirOnlyMultiQuote } = await import("@/lib/public-quote/from-flight.server");
  const { savePublicQuote } = await import("@/lib/public-quote/store.server");

  const dto = buildAirOnlyMultiQuote({
    result,
    options,
    agentName: args.agentName ?? null,
    conversationId: args.conversationId ?? null,
    flightQuoteId: null,
    validUntil: args.validUntil ?? null,
  });

  const { quote, url, shortUrl } = await savePublicQuote(dto as never);
  return {
    quote_id: quote.id,
    public_id: quote.publicId,
    public_url: url,
    short_url: shortUrl ?? null,
    total: options[0]!.total,
    options: options.map((o, i) => ({
      option_number: i + 1,
      total: Number(o.total) || 0,
      currency: "BRL" as const,
    })),
  };
}
