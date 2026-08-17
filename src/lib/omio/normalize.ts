import type { OmioExtra, OmioPreco, OmioResultado, OmioSegmento, OmioTarifa } from "./types";

type Any = Record<string, unknown>;

const isObj = (v: unknown): v is Any => typeof v === "object" && v !== null && !Array.isArray(v);

function walk(node: unknown, visit: (o: Any) => void, depth = 0) {
  if (depth > 12 || node == null) return;
  if (Array.isArray(node)) {
    for (const it of node) walk(it, visit, depth + 1);
    return;
  }
  if (isObj(node)) {
    visit(node);
    for (const v of Object.values(node)) walk(v, visit, depth + 1);
  }
}

function str(o: Any, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (isObj(v)) {
      const n = v["name"] ?? v["displayName"] ?? v["label"] ?? v["city"];
      if (typeof n === "string" && n.trim()) return n.trim();
    }
  }
  return undefined;
}

function num(o: Any, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

export function precoDe(o: unknown): OmioPreco | undefined {
  if (!isObj(o)) return undefined;
  const moeda =
    (typeof o["currency"] === "string" && o["currency"]) ||
    (typeof o["currencyCode"] === "string" && o["currencyCode"]) ||
    undefined;
  let valor = num(o, "amount", "value", "price", "total", "totalPrice");
  if (valor == null && typeof o["amountInCents"] === "number") valor = (o["amountInCents"] as number) / 100;
  if (valor == null) return undefined;
  return { valor, moeda: moeda || "EUR" };
}

function precoProfundo(o: Any): OmioPreco | undefined {
  for (const key of ["price", "totalPrice", "fare", "priceInfo", "cheapestPrice", "amount"]) {
    const direct = precoDe(o[key]);
    if (direct) return direct;
  }
  return precoDe(o);
}

const TIME_KEYS_DEP = ["departureTime", "departure", "departureDateTime", "departsAt", "startTime"];
const TIME_KEYS_ARR = ["arrivalTime", "arrival", "arrivalDateTime", "arrivesAt", "endTime"];

function tempo(o: Any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && /\d{2}:\d{2}/.test(v)) return v;
    if (isObj(v)) {
      const inner = v["dateTime"] ?? v["time"] ?? v["iso"] ?? v["value"];
      if (typeof inner === "string" && /\d{2}:\d{2}/.test(inner)) return inner;
    }
  }
  return undefined;
}

function segmentosDe(o: Any): OmioSegmento[] {
  const raw = (o["segments"] ?? o["legs"] ?? o["subJourneys"] ?? o["trips"]) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((s) => ({
    transportadora: str(s, "carrier", "operator", "companyName", "provider"),
    numero: str(s, "vehicleNumber", "trainNumber", "lineName", "number"),
    origem: str(s, "departurePosition", "origin", "from", "departureStation"),
    destino: str(s, "arrivalPosition", "destination", "to", "arrivalStation"),
    partida: tempo(s, TIME_KEYS_DEP),
    chegada: tempo(s, TIME_KEYS_ARR),
  }));
}

/** Normalização defensiva: a Omio muda o shape do JSON com frequência. */
export function normalizarResultados(payload: unknown, searchId: string, modo: string): OmioResultado[] {
  const out: OmioResultado[] = [];
  const vistos = new Set<string>();

  walk(payload, (o) => {
    const partida = tempo(o, TIME_KEYS_DEP);
    const chegada = tempo(o, TIME_KEYS_ARR);
    if (!partida || !chegada) return;
    const id = str(o, "id", "journeyId", "uuid", "resultId") ?? `${partida}-${chegada}`;
    if (vistos.has(id)) return;
    vistos.add(id);

    const segmentos = segmentosDe(o);
    const transportadoras = Array.from(
      new Set(
        [str(o, "carrier", "operator", "companyName", "provider"), ...segmentos.map((s) => s.transportadora)].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    );

    out.push({
      id,
      searchId,
      modo,
      origem: str(o, "departurePosition", "origin", "from", "departureStation") ?? "",
      destino: str(o, "arrivalPosition", "destination", "to", "arrivalStation") ?? "",
      partida,
      chegada,
      duracaoMinutos: num(o, "durationMinutes", "duration", "totalDuration"),
      conexoes: segmentos.length > 0 ? Math.max(0, segmentos.length - 1) : (num(o, "stops", "changes") ?? 0),
      transportadoras,
      preco: precoProfundo(o),
      segmentos,
    });
  });

  return out.slice(0, 60);
}

export function normalizarTarifas(payload: unknown): OmioTarifa[] {
  const out: OmioTarifa[] = [];
  const vistos = new Set<string>();
  walk(payload, (o) => {
    const nome = str(o, "fareName", "offerName", "ticketName", "tariffName");
    const temTermos = Array.isArray(o["conditions"]) || Array.isArray(o["terms"]) || o["refundable"] !== undefined;
    if (!nome && !temTermos) return;
    const id = str(o, "id", "offerId", "fareId") ?? nome ?? "";
    if (!id || vistos.has(id)) return;
    vistos.add(id);
    const termos = ([...(Array.isArray(o["conditions"]) ? o["conditions"] : []), ...(Array.isArray(o["terms"]) ? o["terms"] : [])] as unknown[])
      .map((t) => (typeof t === "string" ? t : isObj(t) ? (str(t, "text", "label", "description") ?? "") : ""))
      .filter(Boolean);
    out.push({
      id,
      nome: nome ?? id,
      descricao: str(o, "description", "subtitle"),
      preco: precoProfundo(o),
      diferenca: precoDe(o["priceDifference"]),
      reembolsavel: typeof o["refundable"] === "boolean" ? (o["refundable"] as boolean) : undefined,
      trocavel: typeof o["exchangeable"] === "boolean" ? (o["exchangeable"] as boolean) : undefined,
      termos,
    });
  });
  return out.slice(0, 20);
}

export function normalizarExtras(payload: unknown): OmioExtra[] {
  const out: OmioExtra[] = [];
  const vistos = new Set<string>();
  walk(payload, (o) => {
    const tipo = str(o, "ancillaryType", "type", "category");
    const nome = str(o, "name", "title", "label");
    if (!nome) return;
    const ancillary =
      (tipo && /seat|bike|luggage|bag|extra|ancillary|insurance/i.test(tipo)) ||
      /seat|bike|luggage|bag|insurance/i.test(nome);
    if (!ancillary) return;
    const id = str(o, "id", "code") ?? nome;
    if (vistos.has(id)) return;
    vistos.add(id);
    out.push({ id, nome, descricao: str(o, "description"), preco: precoProfundo(o) });
  });
  return out.slice(0, 30);
}
