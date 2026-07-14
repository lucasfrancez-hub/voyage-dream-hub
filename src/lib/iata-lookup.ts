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
