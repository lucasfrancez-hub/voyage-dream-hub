/**
 * Parser da tabela de "passagens mais baratas" do Melhores Destinos
 * (página /voos?rota=XXX/YYY/...). Converte o HTML renderizado em JSON e
 * troca o link do parceiro (CVC, ViajaNet...) pelo motor da VIA AIR.
 */

export type MdOffer = {
  /** Código IATA/logo da companhia mostrado na tabela (ex.: "CA", "LA") */
  airline: string | null;
  airlineLogo: string | null;
  /** Datas normalizadas em YYYY-MM-DD (vindas do link do parceiro) */
  departDate: string;
  returnDate: string | null;
  /** Rótulos como aparecem na tabela ("4/11", "Quarta") */
  departLabel: string;
  returnLabel: string | null;
  weekdayOut: string | null;
  weekdayIn: string | null;
  /** Permanência em dias */
  nights: number | null;
  baggage: string | null;
  price: number;
  priceLabel: string;
  /** Site parceiro original do Melhores Destinos */
  partner: string | null;
  partnerUrl: string;
  /** Link equivalente no motor da VIA AIR (Comprar Viagem) */
  viaairUrl: string;
};

export type MdMonth = { label: string; price: number | null };

export type MdTable = {
  sourceUrl: string;
  title: string | null;
  origin: string;
  destination: string;
  months: MdMonth[];
  offers: MdOffer[];
};

function decode(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function moneyToNumber(text: string): number {
  const digits = text.replace(/[^\d,]/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** Cidades com mais de um aeroporto: o motor precisa do aeroporto principal. */
const CIDADES_MULTI: Record<string, { iata: string; airport: string; city: string }> = {
  SAO: {
    iata: "GRU",
    airport: "Guarulhos - Governador André Franco Montoro International Airport",
    city: "São Paulo",
  },
  RIO: { iata: "GIG", airport: "Galeão - Antonio Carlos Jobim International Airport", city: "Rio de Janeiro" },
  BHZ: { iata: "CNF", airport: "Tancredo Neves International Airport", city: "Belo Horizonte" },
  BUE: { iata: "EZE", airport: "Ministro Pistarini International Airport", city: "Buenos Aires" },
  NYC: { iata: "JFK", airport: "John F Kennedy International Airport", city: "Nova York" },
  LON: { iata: "LHR", airport: "Heathrow Airport", city: "Londres" },
  PAR: { iata: "CDG", airport: "Charles de Gaulle Airport", city: "Paris" },
  MIL: { iata: "MXP", airport: "Malpensa Airport", city: "Milão" },
  ROM: { iata: "FCO", airport: "Fiumicino Airport", city: "Roma" },
  WAS: { iata: "IAD", airport: "Dulles International Airport", city: "Washington" },
  CHI: { iata: "ORD", airport: "O'Hare International Airport", city: "Chicago" },
  TYO: { iata: "NRT", airport: "Narita International Airport", city: "Tóquio" },
};

const CV_BASE = "https://www.comprarviagem.com.br/viaair/flight-list";

function ponta(code: string, nome?: string | null) {
  const iata = String(code ?? "").toUpperCase();
  const multi = CIDADES_MULTI[iata];
  const city = (nome ?? multi?.city ?? iata).trim();
  const finalIata = multi?.iata ?? iata;
  const name = multi ? `${city} - (${multi.iata} - ${multi.airport})` : `${city} - (${iata})`;
  return { iata: finalIata, city, name };
}

const isoZ = (d: string) => `${d}T00:00:00.000Z`;

/** Monta o link do motor público da VIA AIR (Comprar Viagem) já filtrado. */
export function viaairFlightUrl(
  origin: string,
  destination: string,
  depart: string,
  ret: string | null,
  _base = "",
  nomes?: { originName?: string | null; destinationName?: string | null; adults?: number },
): string {
  const from = ponta(origin, nomes?.originName);
  const to = ponta(destination, nomes?.destinationName);
  const p = new URLSearchParams({
    departureDate: isoZ(depart),
    ...(ret ? { returnDate: isoZ(ret) } : {}),
    isRoundTrip: ret ? "true" : "false",
    adultsCount: String(nomes?.adults ?? 1),
    teenagerCount: "0",
    infantCount: "0",
    childCount: "0",
    departureIata: from.iata,
    arrivalIata: to.iata,
    departureName: from.name,
    arrivalName: to.name,
    isDepartureIataCity: "false",
    departureCity: from.city,
    isArrivalIataCity: "false",
    arrivalCity: to.city,
    source: "f",
    refresh: String(Date.now()),
  });
  return `${CV_BASE}?${p.toString()}`;
}

/** Busca sem datas (só o trecho) no motor da VIA AIR. */
export function viaairRouteUrl(origin: string, destination: string, nomes?: {
  originName?: string | null;
  destinationName?: string | null;
}): string {
  const hoje = new Date();
  const ida = new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const volta = new Date(hoje.getTime() + 37 * 86400000).toISOString().slice(0, 10);
  return viaairFlightUrl(origin, destination, ida, volta, "", nomes);
}


/** Converte código IATA/slug da cia no nome comercial (JJ → LATAM). */
export function nomeCompanhia(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = String(code).trim().toUpperCase();
  const map: Record<string, string> = {
    JJ: "LATAM",
    LA: "LATAM",
    LATAM: "LATAM",
    G3: "GOL",
    GOL: "GOL",
    AD: "Azul",
    AZUL: "Azul",
    O6: "Avianca",
    AV: "Avianca",
    "2Z": "Voepass",
    "9R": "Voepass",
    VOEPASS: "Voepass",
    TP: "TAP Air Portugal",
    TAP: "TAP Air Portugal",
    AF: "Air France",
    KL: "KLM",
    LH: "Lufthansa",
    IB: "Iberia",
    UX: "Air Europa",
    AA: "American Airlines",
    UA: "United",
    DL: "Delta",
    CM: "Copa Airlines",
    AR: "Aerolíneas Argentinas",
    AM: "Aeroméxico",
    EK: "Emirates",
    QR: "Qatar Airways",
    TK: "Turkish Airlines",
    ET: "Ethiopian Airlines",
    AC: "Air Canada",
    BA: "British Airways",
    AZ: "ITA Airways",
    ITA: "ITA Airways",
    SQ: "Singapore Airlines",
    JL: "Japan Airlines",
    NH: "ANA",
    H2: "SKY Airline",
    JA: "JetSmart",
    "4C": "LATAM Colômbia",
    CA: "Air China",
    CZ: "China Southern",
    MU: "China Eastern",
    CX: "Cathay Pacific",
    KE: "Korean Air",
    OZ: "Asiana Airlines",
    TG: "Thai Airways",
    MH: "Malaysia Airlines",
    QF: "Qantas",
    NZ: "Air New Zealand",
    SA: "South African Airways",
    MS: "EgyptAir",
    RJ: "Royal Jordanian",
    SV: "Saudia",
    EY: "Etihad Airways",
    GF: "Gulf Air",
    WY: "Oman Air",
    LX: "Swiss",
    OS: "Austrian Airlines",
    SN: "Brussels Airlines",
    SK: "SAS",
    AY: "Finnair",
    LO: "LOT Polish Airlines",
    FR: "Ryanair",
    U2: "easyJet",
    VY: "Vueling",
    W6: "Wizz Air",
    DY: "Norwegian",
    EI: "Aer Lingus",
    VS: "Virgin Atlantic",
    B6: "JetBlue",
    WN: "Southwest",
    AS: "Alaska Airlines",
    NK: "Spirit Airlines",
    F9: "Frontier",
    Y4: "Volaris",
    VB: "Viva Aerobus",
    P5: "Wingo",
    JJ2: "LATAM",
    "5Z": "Cebu Pacific",
    "6E": "IndiGo",
    AI: "Air India",
    ZP: "Paranair",
    PZ: "Paranair",
    BT: "airBaltic",
    UP: "Bahamasair",
    "3M": "Silver Airways",
    "0B": "Blue Air",
  };
  return (map[key] ?? key).toUpperCase();
}


function partnerFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const map: Record<string, string> = {
      "cvc.com.br": "CVC",
      "viajanet.com.br": "ViajaNet",
      "decolar.com": "Decolar",
      "submarinoviagens.com.br": "Submarino Viagens",
      "maxmilhas.com.br": "MaxMilhas",
      "123milhas.com": "123milhas",
      "gol.com.br": "GOL",
      "voeazul.com.br": "Azul",
      "latamairlines.com": "LATAM",
    };
    return map[host] ?? host;
  } catch {
    return null;
  }
}

/** Extrai origem/destino do link do parceiro ou da própria URL da página. */
function routeFromHtml(html: string, sourceUrl: string): { origin: string; destination: string } {
  const rota = /[?&]rota=([A-Z]{3})\/([A-Z]{3})/i.exec(decode(sourceUrl));
  if (rota) return { origin: rota[1].toUpperCase(), destination: rota[2].toUpperCase() };
  const inHtml = /[?&]rota=([A-Z]{3})\/([A-Z]{3})/i.exec(decode(html));
  if (inHtml) return { origin: inHtml[1].toUpperCase(), destination: inHtml[2].toUpperCase() };
  const search = /\/search\/([A-Z]{3})\/([A-Z]{3})/i.exec(decode(html));
  if (search) return { origin: search[1].toUpperCase(), destination: search[2].toUpperCase() };
  return { origin: "", destination: "" };
}

function isoFromPartnerUrl(url: string): { depart: string | null; ret: string | null } {
  const u = decode(url);
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const q = /[?&]Date1=([^&]+)/i.exec(u)?.[1] ?? null;
  const r = /[?&]Date2=([^&]+)/i.exec(u)?.[1] ?? null;
  const alt = u.match(/(\d{4}-\d{2}-\d{2})/g) ?? [];
  return {
    depart: iso(q && decodeURIComponent(q)) ?? iso(alt[0] ?? null),
    ret: iso(r && decodeURIComponent(r)) ?? iso(alt[1] ?? null),
  };
}

/** Faz o parse do HTML renderizado da página /voos do Melhores Destinos. */
export function parseMelhoresDestinos(html: string, sourceUrl: string, base = ""): MdTable {
  const { origin, destination } = routeFromHtml(html, sourceUrl);

  const title =
    stripTags(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "") ||
    stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "") ||
    null;

  const months: MdMonth[] = [];
  const monthRe = /<div class="mes-ano">([\s\S]*?)<\/div>\s*<div class="preco-mes">([\s\S]*?)<\/div>/gi;
  for (const m of html.matchAll(monthRe)) {
    const label = stripTags(m[1]);
    const priceText = stripTags(m[2]);
    months.push({ label, price: priceText ? moneyToNumber(priceText) : null });
  }

  const offers: MdOffer[] = [];
  const itemRe = /<a\s[^>]*href="([^"]+)"[^>]*>\s*<div class="lista-datas-item">([\s\S]*?)<\/div><\/a>/gi;
  for (const m of html.matchAll(itemRe)) {
    const partnerUrl = decode(m[1]);
    const body = m[2];
    const { depart, ret } = isoFromPartnerUrl(partnerUrl);
    if (!depart) continue;

    const logo = /<img[^>]+src="([^"]+icones-cias\/[^"]+)"/i.exec(body)?.[1] ?? null;
    const airline = logo ? (/icones-cias\/([^./]+)\./i.exec(logo)?.[1]?.toUpperCase() ?? null) : null;

    const cell = (cls: string) =>
      new RegExp(`<div class="${cls}"[^>]*>([\\s\\S]*?)<\\/div>\\s*<div class="mc`, "i").exec(body)?.[1] ?? "";

    const outCell = /<div class="mc3">([\s\S]*?)<\/div>\s*<\/div>/i.exec(body)?.[1] ?? cell("mc3");
    const inCell = /<div class="mc4">([\s\S]*?)<\/div>\s*<\/div>/i.exec(body)?.[1] ?? cell("mc4");
    const permCell = /<div class="mc5">([\s\S]*?)<\/div>\s*<\/div>/i.exec(body)?.[1] ?? cell("mc5");
    const priceCell = /<div class="mc7">([\s\S]*?)<\/div>\s*<\/div>/i.exec(body)?.[1] ?? "";
    const bagCell = /<div class="mc6 info_luggage">([\s\S]*?)<div class="mc7"/i.exec(body)?.[1] ?? "";

    const outText = stripTags(outCell);
    const inText = stripTags(inCell);
    const weekdayOut = /<span>([^<]+)<\/span>/i.exec(outCell)?.[1]?.trim() ?? null;
    const weekdayIn = /<span>([^<]+)<\/span>/i.exec(inCell)?.[1]?.trim() ?? null;
    const priceText = stripTags(priceCell).replace(/no site da .*/i, "").trim();

    offers.push({
      airline,
      airlineLogo: logo,
      departDate: depart,
      returnDate: ret,
      departLabel: padData((outText.replace(weekdayOut ?? "", "").trim() || outText).trim()),
      returnLabel: inText
        ? padData((inText.replace(weekdayIn ?? "", "").trim() || inText).trim())
        : null,
      weekdayOut,
      weekdayIn,
      nights: Number(/(\d+)\s*(dias|dia)/i.exec(stripTags(permCell))?.[1] ?? "") || null,
      baggage: stripTags(bagCell) || null,
      price: moneyToNumber(priceText),
      priceLabel: priceText,
      partner: partnerFromUrl(partnerUrl),
      partnerUrl,
      viaairUrl: viaairFlightUrl(origin, destination, depart, ret, base),
    });
  }

  // Dedup por ida+volta+preço (a página repete o item em abas de mês).
  const seen = new Set<string>();
  const unique = offers.filter((o) => {
    const k = `${o.departDate}|${o.returnDate}|${o.price}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { sourceUrl, title, origin, destination, months, offers: unique };
}
