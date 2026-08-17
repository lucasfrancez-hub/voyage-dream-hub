/**
 * Normalização de TRECHOS (legs) do orçamento público.
 *
 * Regra oficial: cada trecho (ida, volta, ou cada perna de um multi-trecho)
 * é um card independente. Segmentos só podem ser unidos no MESMO trecho
 * quando formam uma conexão real:
 *   • o aeroporto de chegada do segmento anterior é o de partida do próximo;
 *   • a espera entre eles é <= MAX_CONNECTION_HOURS.
 *
 * Sem isso a ida e a volta acabavam unidas em um único trecho, gerando
 * "conexões" absurdas (ex.: 53h20).
 */

import { cidadeDoAeroporto } from "@/lib/whatsapp/airport-city";

/** Espera máxima aceita para considerar dois segmentos como conexão. */
export const MAX_CONNECTION_HOURS = 12;

/**
 * Conexão com TROCA DE AEROPORTO na mesma cidade (ex.: chega em CGH e sai de
 * GRU). Continua sendo o MESMO trecho: quebrar aqui criava "duas idas".
 */
export function isTrocaDeAeroporto(fromIata?: string | null, toIata?: string | null): boolean {
  const a = String(fromIata ?? "").trim().toUpperCase();
  const b = String(toIata ?? "").trim().toUpperCase();
  if (!a || !b || a === b) return false;
  const ca = cidadeDoAeroporto(a);
  const cb = cidadeDoAeroporto(b);
  return !!ca && !!cb && ca.cidade_codigo === cb.cidade_codigo;
}

export type LegInputSegment = {
  airline?: string | null;
  airlineIata?: string | null;
  flightNumber?: string | null;
  fromIata: string;
  fromName?: string | null;
  toIata: string;
  toName?: string | null;
  /** ISO ou "YYYY-MM-DD HH:mm". */
  departure?: string | null;
  arrival?: string | null;
  aircraft?: string | null;
  cabin?: string | null;
  fareFamily?: string | null;
  direction?: "OUTBOUND" | "INBOUND" | null;
  tripGroup?: string | null;
  carryOn?: boolean;
  personalItem?: boolean;
  checkedBaggage?: boolean;
  rules?: string[];
};

export const DIAS = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];
export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function parseStamp(v?: string | null): number | null {
  if (!v) return null;
  const s = String(v).trim().replace(" ", "T");
  const t = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isFinite(t) ? t : null;
}

export function timeOf(v?: string | null): string {
  if (!v) return "—";
  const m = String(v).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "—";
}

export function isoDateOf(v?: string | null): string | null {
  const m = String(v ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

export function dateLabelOf(v?: string | null): string {
  const iso = isoDateOf(v);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return `${DIAS[dt.getUTCDay()]}, ${dt.getUTCDate()} de ${MESES[dt.getUTCMonth()]}`;
}

export function durationLabel(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, "0")}`;
}

export function durationBetween(from?: string | null, to?: string | null): string | null {
  const a = parseStamp(from);
  const b = parseStamp(to);
  if (a == null || b == null || b <= a) return null;
  return durationLabel((b - a) / 60000);
}

/** Minutos de espera entre a chegada de `prev` e a partida de `next`. */
function waitMinutes(prev: LegInputSegment, next: LegInputSegment): number | null {
  const a = parseStamp(prev.arrival);
  const b = parseStamp(next.departure);
  if (a == null || b == null) return null;
  return (b - a) / 60000;
}

/** Ordena por partida preservando a ordem original quando não há horário. */
function sortByDeparture(items: LegInputSegment[]): LegInputSegment[] {
  return items
    .map((s, i) => ({ s, i, t: parseStamp(s.departure) }))
    .sort((a, b) => {
      if (a.t == null || b.t == null) return a.i - b.i;
      return a.t - b.t || a.i - b.i;
    })
    .map((x) => x.s);
}

/**
 * Agrupa os segmentos em trechos reais. Nunca une ida com volta.
 */
export function splitIntoLegs(input: LegInputSegment[]): LegInputSegment[][] {
  const items = sortByDeparture(input.filter(Boolean));
  const legs: LegInputSegment[][] = [];
  let current: LegInputSegment[] = [];

  const push = () => {
    if (current.length) legs.push(current);
    current = [];
  };

  for (const seg of items) {
    if (!current.length) {
      current = [seg];
      continue;
    }
    const prev = current[current.length - 1]!;
    const sameGroup = (prev.tripGroup ?? null) === (seg.tripGroup ?? null);
    const sameDirection = (prev.direction ?? null) === (seg.direction ?? null);
    const troca = isTrocaDeAeroporto(prev.toIata, seg.fromIata);
    const conecta = (!!prev.toIata && !!seg.fromIata && prev.toIata === seg.fromIata) || troca;
    const espera = waitMinutes(prev, seg);
    const limiteHoras = sameDirection ? 36 : MAX_CONNECTION_HOURS;
    const esperaOk = espera == null ? conecta : espera >= 0 && espera <= limiteHoras * 60;

    if (sameGroup && sameDirection && conecta && esperaOk) {
      current.push(seg);
    } else {
      push();
      current = [seg];
    }
  }
  push();
  return legs;
}

/**
 * Direção de cada trecho: o primeiro é sempre ida; um trecho que retorna
 * para a origem inicial é volta; os demais seguem como trechos adicionais.
 */
export function directionsFor(legs: LegInputSegment[][]): Array<"OUTBOUND" | "INBOUND"> {
  const origem = legs[0]?.[0]?.fromIata ?? "";
  return legs.map((leg, i) => {
    const explicita = leg[0]?.direction;
    if (explicita) return explicita;
    if (i === 0) return "OUTBOUND";
    const destinoFinal = leg[leg.length - 1]?.toIata ?? "";
    return destinoFinal && destinoFinal === origem ? "INBOUND" : "OUTBOUND";
  });
}

/** Rótulo do trecho ("Voo de ida", "Voo de volta", "Trecho 3"). */
export function legLabel(
  direction: "OUTBOUND" | "INBOUND",
  index: number,
  totalLegs: number,
): string {
  if (totalLegs <= 2) return direction === "INBOUND" ? "Voo de volta" : "Voo de ida";
  if (index === 0) return "Voo de ida";
  if (direction === "INBOUND" && index === totalLegs - 1) return "Voo de volta";
  return `Trecho ${index + 1}`;
}
