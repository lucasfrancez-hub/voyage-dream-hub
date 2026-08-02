import { findAirline } from "@/lib/airlines";

type FlightLegCaption = {
  cia?: string;
  origem?: string;
  destino?: string;
  partida?: string;
  chegada?: string;
  paradas?: number;
  escalas?: string[];
};

export type FlightOptionCaption = {
  opcao: number;
  ida?: FlightLegCaption | null;
  volta?: FlightLegCaption | null;
};

export type FlightQuoteCaption = {
  origem_iata: string;
  destino_iata: string;
  origem_nome: string;
  destino_nome: string;
};

function timeFrom(value?: string): string {
  if (!value) return "";
  const time = value.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1];
  return time ?? value.match(/\b\d{2}:\d{2}\b/)?.[0] ?? "";
}

export function buildFlightOptionCaption(
  quote: FlightQuoteCaption,
  option: FlightOptionCaption,
  /** Mantido por compatibilidade com chamadas antigas; a legenda não é numerada. */
  _numeroExibicao?: number,
): string {
  const cityFrom = (iata?: string) => {
    if (iata === quote.origem_iata) return quote.origem_nome;
    if (iata === quote.destino_iata) return quote.destino_nome;
    return iata ?? "";
  };

  const describeLeg = (leg?: FlightLegCaption | null): string | null => {
    if (!leg) return null;
    const airline = findAirline(leg.cia)?.name ?? leg.cia ?? "";
    const stops = leg.paradas ?? 0;
    const route = `${cityFrom(leg.origem)} ${timeFrom(leg.partida)} → ${cityFrom(leg.destino)} ${timeFrom(leg.chegada)}`;
    const connection = stops === 0
      ? "direto"
      : `${stops} parada${stops > 1 ? "s" : ""}${leg.escalas?.length ? ` (${leg.escalas.join(", ")})` : ""}`;
    return `${route} · ${airline} · ${connection}`;
  };

  const outbound = describeLeg(option.ida);
  const inbound = describeLeg(option.volta);
  const lines: string[] = [];
  if (outbound) lines.push(inbound ? `Ida: ${outbound}` : outbound);
  if (inbound) lines.push(`Volta: ${inbound}`);
  return lines.join("\n");
}