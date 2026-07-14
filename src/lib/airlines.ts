// Central airline registry. Add new airlines here as batches arrive.
// key = IATA code (uppercase). Use ICAO as fallback if IATA doesn't exist.

import aerolineasArgentinas from "@/assets/airlines/aerolineas-argentinas.png.asset.json";
import aeromexico from "@/assets/airlines/aeromexico.png.asset.json";
import airCanada from "@/assets/airlines/air-canada.png.asset.json";
import airChina from "@/assets/airlines/air-china.png.asset.json";
import airEuropa from "@/assets/airlines/air-europa.png.asset.json";
import airFrance from "@/assets/airlines/air-france.png.asset.json";
import airNewZealand from "@/assets/airlines/air-new-zealand.png.asset.json";
import americanAirlines from "@/assets/airlines/american-airlines.png.asset.json";
import ana from "@/assets/airlines/ana.png.asset.json";
import apgAirlines from "@/assets/airlines/apg-airlines.png.asset.json";

export type Airline = {
  /** IATA 2-letter code (uppercase). Primary key. */
  iata: string;
  /** Display name. */
  name: string;
  /** Logo CDN URL. */
  logo: string;
  /** Extra aliases users might type (matched loose, case-insensitive). */
  aliases?: string[];
};

export const AIRLINES: Airline[] = [
  { iata: "AR", name: "Aerolíneas Argentinas", logo: aerolineasArgentinas.url, aliases: ["aerolineas"] },
  { iata: "AM", name: "Aeroméxico",           logo: aeromexico.url,           aliases: ["aeromexico"] },
  { iata: "AC", name: "Air Canada",            logo: airCanada.url },
  { iata: "CA", name: "Air China",             logo: airChina.url },
  { iata: "UX", name: "Air Europa",            logo: airEuropa.url },
  { iata: "AF", name: "Air France",            logo: airFrance.url },
  { iata: "NZ", name: "Air New Zealand",       logo: airNewZealand.url },
  { iata: "AA", name: "American Airlines",     logo: americanAirlines.url, aliases: ["american"] },
  { iata: "NH", name: "ANA",                   logo: ana.url,              aliases: ["all nippon", "all nippon airways"] },
  { iata: "GP", name: "APG Airlines",          logo: apgAirlines.url,      aliases: ["apg"] },
];

const norm = (s: string) => s.trim().toLowerCase();

/** Find an airline by IATA code, exact name, or alias. Returns undefined if not found. */
export function findAirline(input: string | null | undefined): Airline | undefined {
  if (!input) return undefined;
  const q = norm(input);
  const iata = q.toUpperCase();
  return AIRLINES.find(
    (a) =>
      a.iata === iata ||
      norm(a.name) === q ||
      norm(a.name).includes(q) ||
      a.aliases?.some((al) => norm(al) === q || norm(al).includes(q)),
  );
}

/** Get logo URL for an airline reference (IATA or name). */
export function airlineLogo(input: string | null | undefined): string | undefined {
  return findAirline(input)?.logo;
}
