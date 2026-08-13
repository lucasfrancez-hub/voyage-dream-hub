import raw from "./iata-cities.json";

type Entry = { c: string; co?: string };
const DATA = raw as Record<string, Entry>;

/** Look up city (and country) by IATA code. Returns undefined when unknown. */
export function iataInfo(code: string | null | undefined): Entry | undefined {
  if (!code) return undefined;
  const k = code.trim().toUpperCase();
  if (k.length !== 3) return undefined;
  return DATA[k];
}

/** Convenience: city name only. */
export function iataCity(code: string | null | undefined): string | undefined {
  return iataInfo(code)?.c;
}

/**
 * Códigos de cidade/metropolitanos que não constam na base de aeroportos
 * (ou que precisam de nome comercial em pt-BR). IATA é código técnico —
 * o nome da cidade é sempre o texto comercial.
 */
const METRO_CITIES: Record<string, { c: string; co?: string }> = {
  SAO: { c: "São Paulo", co: "Brasil" },
  RIO: { c: "Rio de Janeiro", co: "Brasil" },
  BHZ: { c: "Belo Horizonte", co: "Brasil" },
  BUE: { c: "Buenos Aires", co: "Argentina" },
  ORL: { c: "Orlando", co: "Estados Unidos" },
  NYC: { c: "Nova York", co: "Estados Unidos" },
  WAS: { c: "Washington", co: "Estados Unidos" },
  CHI: { c: "Chicago", co: "Estados Unidos" },
  MIL: { c: "Milão", co: "Itália" },
  ROM: { c: "Roma", co: "Itália" },
  PAR: { c: "Paris", co: "França" },
  LON: { c: "Londres", co: "Reino Unido" },
  BER: { c: "Berlim", co: "Alemanha" },
  MOW: { c: "Moscou", co: "Rússia" },
  TYO: { c: "Tóquio", co: "Japão" },
  OSA: { c: "Osaka", co: "Japão" },
  SEL: { c: "Seul", co: "Coreia do Sul" },
  STO: { c: "Estocolmo", co: "Suécia" },
  YTO: { c: "Toronto", co: "Canadá" },
  YMQ: { c: "Montreal", co: "Canadá" },
  SPU: { c: "Split", co: "Croácia" },
};

export type ResolvedCity = {
  /** Nome comercial da cidade (ou o próprio código quando desconhecido). */
  name: string;
  /** Código IATA/city code normalizado. */
  iata: string;
  /** false quando não foi possível resolver o nome comercial. */
  resolved: boolean;
  country?: string | undefined;
};

/**
 * Resolve um código IATA (cidade ou aeroporto) para o nome comercial.
 * Aceita um nome já conhecido (`preferred`) — usado quando a fonte externa
 * já entregou o nome da cidade.
 */
export function resolveCity(
  code: string | null | undefined,
  preferred?: string | null,
): ResolvedCity {
  const iata = (code ?? "").trim().toUpperCase();
  const pref = preferred?.trim();
  const known = METRO_CITIES[iata] ?? iataInfo(iata);
  // Um "nome" que na verdade é o próprio código não conta como nome comercial.
  const prefOk = !!pref && pref.toUpperCase() !== iata && pref.length > 3;
  if (prefOk) return { name: pref!, iata, resolved: true, country: known?.co };
  if (known?.c) return { name: known.c, iata, resolved: true, country: known.co };
  return { name: iata, iata, resolved: false };
}

/** Nome comercial pronto para exibição (cai no código quando desconhecido). */
export function cityLabel(code: string | null | undefined, preferred?: string | null): string {
  return resolveCity(code, preferred).name;
}
