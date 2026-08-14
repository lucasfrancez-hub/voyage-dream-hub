/**
 * Parser do orçamento web da Infotravel.
 * Prioridade: 1) JSON estruturado (__NEXT_DATA__ / scripts), 2) data-attributes,
 * 3) DOM, 4) regex. SERVER-ONLY (não depende de DOM do navegador).
 */
import { emptyQuote, type NormalizedQuote, type QuoteSourceParser } from "./types";

const IATA = /^[A-Z]{3}$/;

export function isInfotravelQuoteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.endsWith("infotravel.com.br") && /orcamento|proposta|quote/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Extrai o link público do orçamento de dentro de uma URL de compartilhamento (WhatsApp etc.). */
export function extractInfotravelUrl(raw: string): string | null {
  if (!raw) return null;
  const decoded = safeDecode(raw);
  const m = decoded.match(/https?:\/\/[^\s"'<>]*infotravel\.com\.br\/[^\s"'<>]*/i);
  if (!m) return null;
  const url = m[0].replace(/[).,;]+$/, "");
  return isInfotravelQuoteUrl(url) ? url : null;
}

function safeDecode(v: string): string {
  let out = v;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

function jsonBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1]!));
    } catch {
      /* ignora */
    }
  }
  const nd = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nd) {
    try {
      blocks.unshift(JSON.parse(nd[1]!));
    } catch {
      /* ignora */
    }
  }
  const st = html.match(/window\.__(?:INITIAL_STATE|NUXT|DATA)__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i);
  if (st) {
    try {
      blocks.push(JSON.parse(st[1]!));
    } catch {
      /* ignora */
    }
  }
  return blocks;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

function walk(node: unknown, visit: (obj: Rec) => void, depth = 0) {
  if (depth > 12 || !node) return;
  if (Array.isArray(node)) {
    for (const it of node) walk(it, visit, depth + 1);
    return;
  }
  if (isRec(node)) {
    visit(node);
    for (const v of Object.values(node)) walk(v, visit, depth + 1);
  }
}

function pick(obj: Rec, keys: string[]): unknown {
  for (const k of Object.keys(obj)) {
    if (keys.includes(k.toLowerCase())) return obj[k];
  }
  return undefined;
}
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export const InfotravelQuoteParser: QuoteSourceParser = {
  supports: (url) => isInfotravelQuoteUrl(url),

  parse(html: string, url: string): NormalizedQuote {
    const quote = emptyQuote("INFOTRAVEL");
    quote.sourceUrl = url;
    quote.currency = "BRL";

    try {
      const seg = new URL(url).pathname.split("/").filter(Boolean).pop();
      quote.sourceId = seg ?? null;
    } catch {
      /* ignora */
    }

    const blocks = jsonBlocks(html);
    const totals: number[] = [];

    for (const block of blocks) {
      walk(block, (obj) => {
        const bookingId = str(pick(obj, ["bookingid", "quoteid", "orcamentoid", "proposalid"]));
        if (bookingId && !quote.sourceId) quote.sourceId = bookingId;

        const client = pick(obj, ["customer", "cliente", "passengermain", "contact"]);
        if (isRec(client)) {
          const name = str(pick(client, ["name", "nome", "fullname"]));
          if (name && !quote.client?.name) {
            quote.client = {
              name,
              phone: str(pick(client, ["phone", "telefone", "celular", "mobile"])),
              email: str(pick(client, ["email", "mail"])),
            };
          }
        }

        const agent = str(pick(obj, ["agentname", "consultor", "agent", "seller", "vendedor"]));
        if (agent && !quote.agent) quote.agent = agent;
        const agency = str(pick(obj, ["agencyname", "agencia", "agency"]));
        if (agency && !quote.agency) quote.agency = agency;

        // hotel
        const hotelName = str(pick(obj, ["hotelname", "nomehotel", "propertyname"]));
        const isHotelObj =
          hotelName ||
          (str(pick(obj, ["type", "tipo", "producttype"]))?.toUpperCase() === "HOTEL" &&
            str(pick(obj, ["name", "nome"])));
        if (isHotelObj) {
          const name = hotelName ?? str(pick(obj, ["name", "nome"]))!;
          if (!quote.hotels.some((h) => h.name === name)) {
            const photosRaw = pick(obj, ["images", "photos", "fotos"]);
            const photos = Array.isArray(photosRaw)
              ? photosRaw
                  .map((p) => (typeof p === "string" ? p : isRec(p) ? str(pick(p, ["url", "src", "image"])) : null))
                  .filter((p): p is string => !!p)
                  .slice(0, 12)
              : [];
            quote.hotels.push({
              name,
              city: str(pick(obj, ["city", "cidade", "destination", "destino"])),
              address: str(pick(obj, ["address", "endereco", "fulladdress"])),
              checkin: str(pick(obj, ["checkin", "checkindate", "datacheckin"])),
              checkout: str(pick(obj, ["checkout", "checkoutdate", "datacheckout"])),
              nights: num(pick(obj, ["nights", "noites", "diarias"])),
              roomDescription: str(pick(obj, ["roomdescription", "room", "quarto", "roomname"])),
              board: str(pick(obj, ["board", "regime", "mealplan", "pensao"])),
              photos,
              latitude: num(pick(obj, ["latitude", "lat"])),
              longitude: num(pick(obj, ["longitude", "lng", "lon"])),
              total: num(pick(obj, ["total", "totalprice", "valortotal", "amount"])),
            });
          }
        }

        // voo
        const flightNumber = str(pick(obj, ["flightnumber", "numerovoo", "numvoo"]));
        const fromIata = str(pick(obj, ["departureairport", "origin", "origem", "from", "iataorigem"]))?.toUpperCase();
        const toIata = str(pick(obj, ["arrivalairport", "destinationairport", "to", "iatadestino"]))?.toUpperCase();
        if (flightNumber && fromIata && toIata && IATA.test(fromIata) && IATA.test(toIata)) {
          quote.flights.push({
            airline: str(pick(obj, ["airline", "companhia", "carrier", "airlinename"])),
            fromIata,
            toIata,
            departure: str(pick(obj, ["departuredate", "departure", "saida", "datapartida"])),
            arrival: str(pick(obj, ["arrivaldate", "arrival", "chegada", "datachegada"])),
            duration: str(pick(obj, ["duration", "duracao"])),
            stops: num(pick(obj, ["stops", "conexoes", "paradas"])),
            segments: [
              {
                airline: str(pick(obj, ["airline", "companhia", "carrier"])),
                airlineIata: str(pick(obj, ["airlinecode", "carriercode"])),
                flightNumber,
                fromIata,
                toIata,
                departure: str(pick(obj, ["departuredate", "departure", "saida"])),
                arrival: str(pick(obj, ["arrivaldate", "arrival", "chegada"])),
                cabin: str(pick(obj, ["cabin", "classe", "cabinclass"])),
                baggage: str(pick(obj, ["baggage", "bagagem"])),
              },
            ],
            total: num(pick(obj, ["total", "totalprice", "valortotal"])),
          });
        }

        const t = num(pick(obj, ["totalamount", "grandtotal", "valortotal", "totalprice"]));
        if (t && t > 0) totals.push(t);

        const dep = str(pick(obj, ["startdate", "datainicio", "checkin"]));
        if (dep && !quote.startDate && /\d{4}-\d{2}-\d{2}/.test(dep)) quote.startDate = dep.slice(0, 10);
        const ret = str(pick(obj, ["enddate", "datafim", "checkout"]));
        if (ret && !quote.endDate && /\d{4}-\d{2}-\d{2}/.test(ret)) quote.endDate = ret.slice(0, 10);

        const dest = str(pick(obj, ["destination", "destino", "citydestination"]));
        if (dest && !quote.destination && dest.length < 60) quote.destination = dest;
      });
    }

    // --- Fallbacks de DOM/regex ---
    const text = stripTags(html);
    if (!quote.title) {
      const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      quote.title = t ? stripTags(t[1]!) : null;
    }
    if (!quote.destination && quote.hotels[0]?.city) quote.destination = quote.hotels[0].city;

    if (!totals.length) {
      const money = [...text.matchAll(/R\$\s*([\d.]+,\d{2})/g)]
        .map((m) => num(m[1]!))
        .filter((n): n is number => n !== null);
      if (money.length) totals.push(Math.max(...money));
    }
    if (totals.length) quote.total = Math.max(...totals);

    if (!quote.hotels.length) {
      const h = text.match(/Hotel\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w\sÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç'-]{2,60}/);
      if (h) quote.hotels.push({ name: h[0].trim() });
    }

    quote.notes = null;
    return quote;
  },
};

export const QUOTE_PARSERS: QuoteSourceParser[] = [InfotravelQuoteParser];

export function parserFor(url: string): QuoteSourceParser | null {
  return QUOTE_PARSERS.find((p) => p.supports(url)) ?? null;
}
