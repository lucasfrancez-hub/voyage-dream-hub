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
import arajet from "@/assets/airlines/arajet.png.asset.json";
import avianca from "@/assets/airlines/avianca.png.asset.json";
import azul from "@/assets/airlines/azul.png.asset.json";
import boliviana from "@/assets/airlines/boliviana.png.asset.json";
import britishAirways from "@/assets/airlines/british-airways.png.asset.json";
import cathay from "@/assets/airlines/cathay.png.asset.json";
import copa from "@/assets/airlines/copa.png.asset.json";
import delta from "@/assets/airlines/delta.png.asset.json";
import elAl from "@/assets/airlines/el-al.png.asset.json";
import emirates from "@/assets/airlines/emirates.png.asset.json";
import ethiopian from "@/assets/airlines/ethiopian.png.asset.json";
import gol from "@/assets/airlines/gol.png.asset.json";
import hahnair from "@/assets/airlines/hahnair.png.asset.json";
import iberia from "@/assets/airlines/iberia.png.asset.json";
import itaAirways from "@/assets/airlines/ita-airways.png.asset.json";
import japanAirlines from "@/assets/airlines/japan-airlines.png.asset.json";
import jetsmart from "@/assets/airlines/jetsmart.png.asset.json";
import klm from "@/assets/airlines/klm.png.asset.json";
import koreanAir from "@/assets/airlines/korean-air.png.asset.json";
import latam from "@/assets/airlines/latam.png.asset.json";
import lufthansa from "@/assets/airlines/lufthansa.png.asset.json";
import qantas from "@/assets/airlines/qantas.png.asset.json";
import qatar from "@/assets/airlines/qatar.png.asset.json";
import royalAirMaroc from "@/assets/airlines/royal-air-maroc.png.asset.json";
import singaporeAirlines from "@/assets/airlines/singapore-airlines.png.asset.json";
import sky from "@/assets/airlines/sky.png.asset.json";
import southAfricanAirways from "@/assets/airlines/south-african-airways.png.asset.json";
import swiss from "@/assets/airlines/swiss.png.asset.json";
import taag from "@/assets/airlines/taag.png.asset.json";
import tap from "@/assets/airlines/tap.png.asset.json";
import turkishAirlines from "@/assets/airlines/turkish-airlines.png.asset.json";
import united from "@/assets/airlines/united.png.asset.json";
import xiamenAir from "@/assets/airlines/xiamen-air.png.asset.json";

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
  { iata: "AR", name: "Aerolíneas Argentinas",  logo: aerolineasArgentinas.url, aliases: ["aerolineas"] },
  { iata: "AM", name: "Aeroméxico",             logo: aeromexico.url,           aliases: ["aeromexico"] },
  { iata: "AC", name: "Air Canada",             logo: airCanada.url },
  { iata: "CA", name: "Air China",              logo: airChina.url },
  { iata: "UX", name: "Air Europa",             logo: airEuropa.url },
  { iata: "AF", name: "Air France",             logo: airFrance.url },
  { iata: "NZ", name: "Air New Zealand",        logo: airNewZealand.url },
  { iata: "AA", name: "American Airlines",      logo: americanAirlines.url,     aliases: ["american"] },
  { iata: "NH", name: "ANA",                    logo: ana.url,                  aliases: ["all nippon", "all nippon airways"] },
  { iata: "GP", name: "APG Airlines",           logo: apgAirlines.url,          aliases: ["apg"] },
  { iata: "DM", name: "Arajet",                 logo: arajet.url },
  { iata: "AV", name: "Avianca",                logo: avianca.url },
  { iata: "AD", name: "Azul",                   logo: azul.url,                 aliases: ["azul linhas aereas", "azul linhas aéreas"] },
  { iata: "OB", name: "Boliviana de Aviación",  logo: boliviana.url,            aliases: ["boa", "boliviana"] },
  { iata: "BA", name: "British Airways",        logo: britishAirways.url,       aliases: ["british"] },
  { iata: "CX", name: "Cathay Pacific",         logo: cathay.url,               aliases: ["cathay"] },
  { iata: "CM", name: "Copa Airlines",          logo: copa.url,                 aliases: ["copa"] },
  { iata: "DL", name: "Delta Air Lines",        logo: delta.url,                aliases: ["delta"] },
  { iata: "LY", name: "El Al",                  logo: elAl.url,                 aliases: ["el al israel airlines"] },
  { iata: "EK", name: "Emirates",               logo: emirates.url },
  { iata: "ET", name: "Ethiopian Airlines",     logo: ethiopian.url,            aliases: ["ethiopian"] },
  { iata: "G3", name: "GOL",                    logo: gol.url,                  aliases: ["gol linhas aereas", "gol linhas aéreas"] },
  { iata: "HR", name: "Hahn Air",               logo: hahnair.url,              aliases: ["hahnair"] },
  { iata: "IB", name: "Iberia",                 logo: iberia.url },
  { iata: "AZ", name: "ITA Airways",            logo: itaAirways.url,           aliases: ["ita"] },
  { iata: "JL", name: "Japan Airlines",         logo: japanAirlines.url,        aliases: ["jal"] },
  { iata: "JA", name: "JetSMART",               logo: jetsmart.url,             aliases: ["jetsmart"] },
  { iata: "KL", name: "KLM",                    logo: klm.url,                  aliases: ["royal dutch airlines"] },
  { iata: "KE", name: "Korean Air",             logo: koreanAir.url },
  { iata: "LA", name: "LATAM",                  logo: latam.url,                aliases: ["latam airlines"] },
  { iata: "LH", name: "Lufthansa",              logo: lufthansa.url },
  { iata: "QF", name: "Qantas",                 logo: qantas.url },
  { iata: "QR", name: "Qatar Airways",          logo: qatar.url,                aliases: ["qatar"] },
  { iata: "AT", name: "Royal Air Maroc",        logo: royalAirMaroc.url,        aliases: ["ram"] },
  { iata: "SQ", name: "Singapore Airlines",     logo: singaporeAirlines.url,    aliases: ["singapore"] },
  { iata: "H2", name: "SKY Airline",            logo: sky.url,                  aliases: ["sky"] },
  { iata: "SA", name: "South African Airways",  logo: southAfricanAirways.url,  aliases: ["saa"] },
  { iata: "LX", name: "SWISS",                  logo: swiss.url,                aliases: ["swiss international air lines"] },
  { iata: "DT", name: "TAAG Angola Airlines",   logo: taag.url,                 aliases: ["taag"] },
  { iata: "TP", name: "TAP Air Portugal",       logo: tap.url,                  aliases: ["tap", "tap portugal"] },
  { iata: "TK", name: "Turkish Airlines",       logo: turkishAirlines.url,      aliases: ["turkish"] },
  { iata: "UA", name: "United Airlines",        logo: united.url,               aliases: ["united"] },
  { iata: "MF", name: "Xiamen Air",             logo: xiamenAir.url,            aliases: ["xiamenair"] },
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
