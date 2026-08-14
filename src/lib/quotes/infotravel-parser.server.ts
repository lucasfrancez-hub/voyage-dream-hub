/**
 * Parser do Orçamento Web da Infotravel (multi-opções).
 *
 * Prioridade de leitura:
 *   1) dados estruturados da aplicação (__NEXT_DATA__ / application-json / __INITIAL_STATE__)
 *   2) identificadores expostos no HTML (bookingId, bookingIndex, companyCode, token)
 *   3) DOM/regex como último recurso
 *
 * Regra central: uma URL pode conter VÁRIAS opções comerciais. Nunca importar
 * apenas a opção selecionada — todas viram `quote.options[]` do MESMO orçamento.
 * SERVER-ONLY (não depende de DOM do navegador).
 */
import {
  emptyOption,
  emptyQuote,
  optionHasProducts,
  type NormalizedOption,
  type NormalizedQuote,
  type QuoteSourceParser,
} from "./types";

const IATA = /^[A-Z]{3}$/;

export function isInfotravelQuoteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.endsWith("infotravel.com.br");
  } catch {
    return false;
  }
}

/** Extrai o link do orçamento de dentro de uma URL de compartilhamento (WhatsApp etc.). */
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
  if (depth > 14 || !node) return;
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

/* ------------------------------------------------------------------ */
/* Identificadores da operadora                                        */
/* ------------------------------------------------------------------ */

export type InfotravelRefs = {
  bookingId: string | null;
  bookingIndex: string | null;
  companyCode: string | null;
  token: string | null;
};

export function extractInfotravelRefs(html: string, url: string): InfotravelRefs {
  const refs: InfotravelRefs = { bookingId: null, bookingIndex: null, companyCode: null, token: null };

  const grab = (re: RegExp): string | null => {
    const m = html.match(re);
    return m && m[1] ? m[1].trim() : null;
  };
  refs.bookingId = grab(/"bookingId"\s*:\s*"?([\w-]+)"?/i) ?? grab(/bookingId=([\w-]+)/i);
  refs.bookingIndex = grab(/"bookingIndex"\s*:\s*"?([\w-]+)"?/i) ?? grab(/bookingIndex=([\w-]+)/i);
  refs.companyCode = grab(/"companyCode"\s*:\s*"([\w-]+)"/i) ?? grab(/companyCode=([\w-]+)/i);

  try {
    const u = new URL(url);
    refs.bookingId ??= u.searchParams.get("bookingId");
    refs.bookingIndex ??= u.searchParams.get("bookingIndex");
    refs.companyCode ??= u.searchParams.get("companyCode");
    refs.token =
      u.searchParams.get("token") ??
      u.searchParams.get("hash") ??
      u.pathname.split("/").filter(Boolean).pop() ??
      null;
  } catch {
    /* ignora */
  }
  return refs;
}

/* ------------------------------------------------------------------ */
/* Coleta de produtos de um subconjunto de dados                       */
/* ------------------------------------------------------------------ */

function collectInto(option: NormalizedOption, node: unknown) {
  const totals: number[] = [];

  walk(node, (obj) => {
    // ----- hospedagem -----
    const hotelName = str(pick(obj, ["hotelname", "nomehotel", "propertyname"]));
    const typeStr = str(pick(obj, ["type", "tipo", "producttype"]))?.toUpperCase() ?? "";
    const isHotelObj = hotelName || (typeStr === "HOTEL" && str(pick(obj, ["name", "nome"])));
    if (isHotelObj) {
      const name = hotelName ?? str(pick(obj, ["name", "nome"]))!;
      if (!option.hotels.some((h) => h.name === name)) {
        const photosRaw = pick(obj, ["images", "photos", "fotos"]);
        const photos = Array.isArray(photosRaw)
          ? photosRaw
              .map((p) => (typeof p === "string" ? p : isRec(p) ? str(pick(p, ["url", "src", "image"])) : null))
              .filter((p): p is string => !!p)
              .slice(0, 12)
          : [];
        const amenitiesRaw = pick(obj, ["amenities", "comodidades", "facilities"]);
        const amenities = Array.isArray(amenitiesRaw)
          ? amenitiesRaw
              .map((a) => (typeof a === "string" ? a : isRec(a) ? str(pick(a, ["name", "nome", "description"])) : null))
              .filter((a): a is string => !!a)
              .slice(0, 24)
          : [];
        option.hotels.push({
          name,
          city: str(pick(obj, ["city", "cidade", "destination", "destino"])),
          address: str(pick(obj, ["address", "endereco", "fulladdress"])),
          checkin: str(pick(obj, ["checkin", "checkindate", "datacheckin"])),
          checkout: str(pick(obj, ["checkout", "checkoutdate", "datacheckout"])),
          nights: num(pick(obj, ["nights", "noites", "diarias"])),
          roomDescription:
            str(pick(obj, ["roomdescription", "room", "quarto", "roomname"])) ??
            (amenities.length ? amenities.join(" • ") : null),
          board: str(pick(obj, ["board", "regime", "mealplan", "pensao"])),
          photos,
          latitude: num(pick(obj, ["latitude", "lat"])),
          longitude: num(pick(obj, ["longitude", "lng", "lon"])),
          total: num(pick(obj, ["total", "totalprice", "valortotal", "amount"])),
        });
      }
    }

    // ----- aéreo -----
    const flightNumber = str(pick(obj, ["flightnumber", "numerovoo", "numvoo"]));
    const fromIata = str(pick(obj, ["departureairport", "origin", "origem", "from", "iataorigem"]))?.toUpperCase();
    const toIata = str(pick(obj, ["arrivalairport", "destinationairport", "to", "iatadestino"]))?.toUpperCase();
    if (flightNumber && fromIata && toIata && IATA.test(fromIata) && IATA.test(toIata)) {
      const departure = str(pick(obj, ["departuredate", "departure", "saida", "datapartida"]));
      const dup = option.flights.some(
        (f) => f.segments[0]?.flightNumber === flightNumber && f.segments[0]?.departure === departure,
      );
      if (!dup) {
        option.flights.push({
          airline: str(pick(obj, ["airline", "companhia", "carrier", "airlinename"])),
          fromIata,
          toIata,
          departure,
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
              departure,
              arrival: str(pick(obj, ["arrivaldate", "arrival", "chegada"])),
              cabin: str(pick(obj, ["cabin", "classe", "cabinclass"])),
              baggage: str(pick(obj, ["baggage", "bagagem"])),
            },
          ],
          total: num(pick(obj, ["total", "totalprice", "valortotal"])),
        });
      }
    }

    // ----- demais produtos -----
    const genericBuckets: Array<[string[], keyof NormalizedOption]> = [
      [["CAR", "CARRO", "RENTALCAR", "VEHICLE"], "cars"],
      [["TRANSFER", "TRASLADO"], "transfers"],
      [["TOUR", "ACTIVITY", "PASSEIO", "EXPERIENCE"], "activities"],
      [["TICKET", "INGRESSO", "ATTRACTION"], "tickets"],
      [["INSURANCE", "SEGURO", "ASSISTANCE"], "insurance"],
      [["SERVICE", "SERVICO", "SERVIÇO", "OTHER", "OUTROS"], "services"],
    ];
    for (const [kinds, bucket] of genericBuckets) {
      if (!kinds.includes(typeStr)) continue;
      const name = str(pick(obj, ["name", "nome", "title", "descricao", "description"]));
      if (!name) continue;
      const list = option[bucket] as { name: string }[];
      if (list.some((i) => i.name === name)) continue;
      list.push({
        name,
        description: str(pick(obj, ["description", "descricao", "details"])),
        date: str(pick(obj, ["date", "data", "startdate", "pickupdate"])),
        quantity: num(pick(obj, ["quantity", "quantidade", "qty"])),
        total: num(pick(obj, ["total", "totalprice", "valortotal", "amount"])),
      } as never);
    }

    // ----- valores / datas / destino -----
    const t = num(pick(obj, ["totalamount", "grandtotal", "valortotal", "totalprice", "salevalue"]));
    if (t && t > 0) totals.push(t);

    const dep = str(pick(obj, ["startdate", "datainicio", "checkin"]));
    if (dep && !option.startDate && /\d{4}-\d{2}-\d{2}/.test(dep)) option.startDate = dep.slice(0, 10);
    const ret = str(pick(obj, ["enddate", "datafim", "checkout"]));
    if (ret && !option.endDate && /\d{4}-\d{2}-\d{2}/.test(ret)) option.endDate = ret.slice(0, 10);

    const dest = str(pick(obj, ["destination", "destino", "citydestination"]));
    if (dest && !option.destination && dest.length < 60) option.destination = dest;

    const payment = pick(obj, ["paymentconditions", "condicoespagamento", "paymentoptions"]);
    if (Array.isArray(payment) && !option.paymentConditions?.length) {
      const conds = payment
        .map((p) => (typeof p === "string" ? p : isRec(p) ? str(pick(p, ["description", "descricao", "label"])) : null))
        .filter((p): p is string => !!p);
      if (conds.length) option.paymentConditions = conds;
    }
  });

  if (option.total == null && totals.length) option.total = Math.max(...totals);
  if (!option.destination && option.hotels[0]?.city) option.destination = option.hotels[0].city;
  if (!option.startDate && option.hotels[0]?.checkin) option.startDate = option.hotels[0].checkin.slice(0, 10);
  if (!option.endDate && option.hotels[0]?.checkout) option.endDate = option.hotels[0].checkout.slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Detecção das opções                                                 */
/* ------------------------------------------------------------------ */

const OPTION_KEYS = [
  "options",
  "opcoes",
  "opções",
  "quotations",
  "cotacoes",
  "cotações",
  "orcamentos",
  "orçamentos",
  "budgets",
  "proposals",
  "propostas",
  "alternativas",
  "alternatives",
  "bookings",
];

/** Localiza o maior conjunto de opções dentro dos dados estruturados da página. */
function findOptionContainers(blocks: unknown[]): unknown[] {
  let best: unknown[] = [];
  for (const block of blocks) {
    walk(block, (obj) => {
      for (const key of Object.keys(obj)) {
        if (!OPTION_KEYS.includes(key.toLowerCase())) continue;
        const value = obj[key];
        if (!Array.isArray(value) || value.length < 2) continue;
        const objs = value.filter(isRec);
        if (objs.length < 2) continue;
        if (objs.length > best.length) best = objs;
      }
    });
  }
  return best;
}

/** Fallback: separa o texto por marcadores "Opção N" quando não há JSON de opções. */
function optionLabelsFromHtml(html: string): string[] {
  const found = new Set<string>();
  const re = /Op(?:ç|c)(?:ã|a)o\s*(\d{1,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) found.add(m[1]!);
  return [...found].sort((a, b) => Number(a) - Number(b));
}

export const InfotravelQuoteParser: QuoteSourceParser = {
  supports: (url) => isInfotravelQuoteUrl(url),

  parse(html: string, url: string): NormalizedQuote {
    const quote = emptyQuote("INFOTRAVEL");
    quote.sourceUrl = url;
    quote.currency = "BRL";

    const refs = extractInfotravelRefs(html, url);
    quote.sourceBookingId = refs.bookingId;
    quote.sourceBookingIndex = refs.bookingIndex;
    quote.sourceCompanyCode = refs.companyCode;
    quote.sourceToken = refs.token;
    quote.sourceId = refs.bookingId ?? refs.token;

    const blocks = jsonBlocks(html);

    // dados de cabeçalho (cliente, agente, agência) — nível do orçamento
    for (const block of blocks) {
      walk(block, (obj) => {
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
        const origin = str(pick(obj, ["origincity", "cidadeorigem", "originname"]));
        if (origin && !quote.origin && origin.length < 60) quote.origin = origin;
      });
    }

    // ----- opções -----
    const containers = findOptionContainers(blocks);
    const options: NormalizedOption[] = [];

    if (containers.length) {
      containers.forEach((container, i) => {
        const option = emptyOption(i + 1);
        const rec = container as Rec;
        option.label = str(pick(rec, ["name", "nome", "label", "title", "descricao"])) ?? `Opção ${i + 1}`;
        option.sourceReference =
          str(pick(rec, ["id", "bookingid", "bookingindex", "code", "codigo"])) ?? refs.bookingId;
        option.total = num(pick(rec, ["totalamount", "grandtotal", "valortotal", "totalprice", "total"]));
        option.currency = "BRL";
        collectInto(option, container);
        if (optionHasProducts(option) || option.total) options.push(option);
      });
    }

    if (!options.length) {
      // uma única opção: tudo o que estiver na página
      const option = emptyOption(1);
      option.label = "Opção 1";
      option.currency = "BRL";
      option.sourceReference = refs.bookingId;
      for (const block of blocks) collectInto(option, block);
      options.push(option);
    }

    // renumera e rotula
    options.forEach((o, i) => {
      o.optionNumber = i + 1;
      if (!o.label || /^\s*$/.test(o.label)) o.label = `Opção ${i + 1}`;
    });

    // ----- fallbacks de DOM/regex -----
    const text = stripTags(html);
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    quote.title = t ? stripTags(t[1]!) : null;

    const money = [...text.matchAll(/R\$\s*([\d.]+,\d{2})/g)]
      .map((m) => num(m[1]!))
      .filter((n): n is number => n !== null);

    for (const o of options) {
      if (o.total == null && money.length) o.total = Math.max(...money);
      if (!o.hotels.length && !o.flights.length) {
        const h = text.match(/Hotel\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w\sÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç'-]{2,60}/);
        if (h) o.hotels.push({ name: h[0].trim() });
      }
    }

    // se o HTML anuncia mais opções do que conseguimos ler, registra a diferença
    const labels = optionLabelsFromHtml(html);
    if (labels.length > options.length) {
      quote.notes = [
        `A página indica ${labels.length} opções; ${options.length} foram lidas automaticamente. Reprocesse o orçamento se faltar alguma.`,
      ];
    }

    quote.options = options;

    // espelho da opção 1 (compatibilidade com telas que leem o nível raiz)
    const first = options[0]!;
    quote.hotels = first.hotels;
    quote.flights = first.flights;
    quote.cars = first.cars;
    quote.transfers = first.transfers;
    quote.activities = first.activities;
    quote.tickets = first.tickets;
    quote.insurance = first.insurance;
    quote.services = first.services;
    quote.startDate = first.startDate ?? null;
    quote.endDate = first.endDate ?? null;
    quote.destination = first.destination ?? null;
    quote.total = first.total ?? null;
    quote.paymentConditions = first.paymentConditions ?? null;

    return quote;
  },
};

export const QUOTE_PARSERS: QuoteSourceParser[] = [InfotravelQuoteParser];

export function parserFor(url: string): QuoteSourceParser | null {
  return QUOTE_PARSERS.find((p) => p.supports(url)) ?? null;
}

/**
 * Se a página carrega outras opções por chamadas próprias (bookingIndex),
 * o adapter tenta buscar cada índice adicional e mesclar as opções.
 * Best effort: qualquer falha mantém as opções já lidas.
 */
export async function fetchAdditionalOptions(
  url: string,
  refs: InfotravelRefs,
  known: NormalizedOption[],
  fetchHtml: (u: string) => Promise<string | null>,
): Promise<NormalizedOption[]> {
  if (!refs.bookingId) return known;
  const merged = [...known];
  const seen = new Set(merged.map((o) => `${o.sourceReference ?? ""}|${o.total ?? ""}`));

  for (let index = 0; index < 10; index++) {
    if (String(index) === String(refs.bookingIndex ?? "")) continue;
    let target: string;
    try {
      const u = new URL(url);
      u.searchParams.set("bookingIndex", String(index));
      target = u.toString();
    } catch {
      break;
    }
    const html = await fetchHtml(target);
    if (!html) continue;
    const parsed = InfotravelQuoteParser.parse(html, target);
    for (const opt of parsed.options) {
      const key = `${opt.sourceReference ?? ""}|${opt.total ?? ""}`;
      if (seen.has(key) || !optionHasProducts(opt)) continue;
      seen.add(key);
      merged.push({ ...opt, optionNumber: merged.length + 1, label: `Opção ${merged.length + 1}` });
    }
  }
  return merged;
}
