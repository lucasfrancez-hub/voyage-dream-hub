/**
 * Converte uma opção do motor VIA AIR (FlightQuoteResult + FlightQuoteOption)
 * no orçamento público AIR_ONLY.
 *
 * Nada de comissão, markup, custo, fornecedor ou observação interna aqui:
 * este objeto vai inteiro para o link público.
 *
 * SERVER-ONLY.
 */
import { findAirline } from "@/lib/airlines";
import { cityLabel } from "@/lib/iata-lookup";
import { buildPayment } from "./payments";
import type {
  FlightLeg,
  FlightSegment,
  PassengerSummary,
  PublicQuote,
  QuoteSummaryLine,
} from "./types";
import type { FlightQuoteLeg, FlightQuoteOption, FlightQuoteResult } from "@/lib/whatsapp/flight-quote.server";

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function parse(stamp: string): { date: Date | null; hora: string } {
  const [d, h] = String(stamp ?? "").split(" ");
  const [y, m, dd] = (d ?? "").split("-").map(Number);
  const ok = y && m && dd;
  return { date: ok ? new Date(Date.UTC(y, m - 1, dd)) : null, hora: h ?? "—" };
}

export function dataExtenso(stamp: string): string {
  const { date } = parse(stamp);
  if (!date) return "—";
  return `${DIAS[date.getUTCDay()]}, ${date.getUTCDate()} de ${MESES[date.getUTCMonth()]}`;
}

function stops(leg: FlightQuoteLeg): { n: number; label: string } {
  const n = Math.max(0, Number(leg.paradas) || 0);
  if (n <= 0) return { n: 0, label: "Direto" };
  const base = n === 1 ? "1 conexão" : `${n} conexões`;
  return { n, label: leg.escalas?.length ? `${base} em ${leg.escalas.join(", ")}` : base };
}

function toSegments(leg: FlightQuoteLeg): FlightSegment[] {
  return [
    {
      airline: findAirline(leg.cia)?.name ?? leg.cia,
      airlineIata: leg.cia,
      flightNumber: leg.voo || null,
      fromIata: leg.origem,
      fromName: cityLabel(leg.origem) || null,
      toIata: leg.destino,
      toName: cityLabel(leg.destino) || null,
      departure: leg.partida,
      arrival: leg.chegada,
      duration: leg.duracao || null,
    },
  ];
}

function toLeg(leg: FlightQuoteLeg, direction: "OUTBOUND" | "INBOUND"): FlightLeg {
  const p = parse(leg.partida);
  const c = parse(leg.chegada);
  const s = stops(leg);
  return {
    direction,
    label: direction === "OUTBOUND" ? "Voo de ida" : "Voo de volta",
    airline: findAirline(leg.cia)?.name ?? leg.cia,
    airlineIata: leg.cia,
    dateLabel: dataExtenso(leg.partida),
    departureTime: p.hora,
    arrivalTime: c.hora,
    fromIata: leg.origem,
    fromCity: cityLabel(leg.origem) || null,
    toIata: leg.destino,
    toCity: cityLabel(leg.destino) || null,
    duration: leg.duracao || null,
    stops: s.n,
    stopsLabel: s.label,
    carryOn: true,
    personalItem: true,
    checkedBaggage: !!leg.bagagem_despachada,
    segments: toSegments(leg),
  };
}

function passageiros(p: FlightQuoteResult["passageiros"]): PassengerSummary {
  const partes: string[] = [];
  if (p.adultos) partes.push(`${p.adultos} ${p.adultos === 1 ? "adulto" : "adultos"}`);
  if (p.criancas) partes.push(`${p.criancas} ${p.criancas === 1 ? "criança" : "crianças"}`);
  if (p.bebes) partes.push(`${p.bebes} ${p.bebes === 1 ? "bebê" : "bebês"}`);
  return {
    adults: p.adultos,
    children: p.criancas,
    infants: p.bebes,
    label: partes.join(" • ") || "1 adulto",
  };
}

function brl(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Monta produtos + totais + pagamento de UMA opção de voo. */
function buildOptionPayload(option: FlightQuoteOption, numero: number) {
  const legs: FlightLeg[] = [toLeg(option.ida, "OUTBOUND")];
  if (option.volta) legs.push(toLeg(option.volta, "INBOUND"));

  const total = Number(option.total) || 0;
  const payment = buildPayment({ type: "AIR_ONLY", total, airline: option.ida?.cia });

  const summary: QuoteSummaryLine[] = [
    {
      icon: "flight",
      label: option.volta ? "Passagens aéreas (ida e volta)" : "Passagens aéreas (somente ida)",
      value: brl(total),
    },
  ];

  return {
    products: { flights: [{ id: `opt-${numero}`, optionId: String(numero), legs }] },
    payment,
    totals: { products: total, taxes: 0, total, pixTotal: payment.pix.total },
    summary,
  };
}

function labelOpcao(option: FlightQuoteOption, numero: number): string {
  const cia = findAirline(option.ida?.cia)?.name ?? option.ida?.cia ?? "";
  const destaque = option.destaque ? option.destaque.charAt(0).toUpperCase() + option.destaque.slice(1) : "";
  const extra = destaque || cia;
  return extra ? `Opção ${numero} — ${extra}` : `Opção ${numero}`;
}

export function buildAirOnlyQuote(params: {
  result: FlightQuoteResult;
  option: FlightQuoteOption;
  optionIndex: number;
  /** Todas as opções geradas pelo motor — viram abas dentro do orçamento. */
  allOptions?: FlightQuoteOption[] | null;
  agentName?: string | null;
  conversationId?: string | null;
  flightQuoteId?: string | null;
  validUntil?: string | null;
}): Omit<PublicQuote, "id" | "publicId" | "createdAt" | "updatedAt"> & {
  conversationId?: string | null;
  flightQuoteId?: string | null;
  optionIndex?: number | null;
} {
  const { result, option } = params;
  const base = buildOptionPayload(option, params.optionIndex);

  const origem = result.origem_nome || cityLabel(result.origem_iata) || result.origem_iata;
  const destino = result.destino_nome || cityLabel(result.destino_iata) || result.destino_iata;

  const todas = (params.allOptions ?? []).filter(Boolean);
  const options =
    todas.length > 1
      ? todas.map((o, i) => {
          const p = buildOptionPayload(o, i + 1);
          return {
            optionId: String(i + 1),
            label: labelOpcao(o, i + 1),
            products: p.products,
            totals: p.totals,
            payment: p.payment,
            summary: p.summary,
          };
        })
      : undefined;

  return {
    type: "AIR_ONLY",
    title: `${origem} → ${destino}`,
    subtitle: option.destaque ? option.destaque.charAt(0).toUpperCase() + option.destaque.slice(1) : null,
    origin: origem,
    destination: destino,
    startDate: result.data_ida,
    endDate: result.data_volta,
    tripKind: option.volta ? "Ida e volta" : "Somente ida",
    passengers: passageiros(result.passageiros),
    products: base.products,
    ...(options ? { options } : {}),
    payment: base.payment,
    totals: base.totals,
    summary: base.summary,
    agent: params.agentName ? { name: params.agentName, photoUrl: null, phone: null, whatsapp: null, email: null } : null,
    source: { type: "SYSTEM", conversationId: params.conversationId ?? null },
    validUntil: params.validUntil ?? null,
    publicNotes: null,
    conversationId: params.conversationId ?? null,
    flightQuoteId: params.flightQuoteId ?? null,
    optionIndex: params.optionIndex,
  };
}

