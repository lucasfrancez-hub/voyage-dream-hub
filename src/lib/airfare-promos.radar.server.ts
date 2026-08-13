/**
 * RADAR POR ORIGEM — Melhores Destinos (API pública TWD).
 *
 * O feed de "promoções" do Melhores Destinos publica pouquíssimas rotas das
 * origens regionais (MGF/LDB/CAC/IGU costumavam render 2 candidatas).
 * Aqui varremos a árvore de categorias filtrada POR ORIGEM
 * (`/twd/web/categories?from_iata_code=MGF`), que devolve TODOS os destinos
 * com tarifa monitorada saindo daquela origem — nacionais e internacionais.
 *
 * Este módulo só DESCOBRE (destino + preço de referência + datas reais).
 * O preço comercial continua vindo obrigatoriamente do motor VIA AIR.
 */
import { scopeOfRoute } from "@/lib/br-airports";
import {
  mdFetchJson,
  mdRadarAvailable,
  MdCancelledError,
  type MdCancel,
} from "@/lib/melhores-destinos.server";

const API = "https://passagensaereas.melhoresdestinos.com.br";
const TWD = `${API}/api/v1/twd/web`;

/** Códigos de cidade do Melhores Destinos → aeroporto usado pelo motor. */
export const METRO_TO_AIRPORT: Record<string, string> = {
  SAO: "GRU", RIO: "GIG", BHZ: "CNF", ORL: "MCO", NYC: "JFK", WAS: "IAD",
  BUE: "EZE", MIL: "MXP", ROM: "FCO", PAR: "CDG", LON: "LHR", CHI: "ORD",
  TYO: "NRT", SPK: "CTS", BER: "BER", MOW: "SVO", STO: "ARN", OSA: "KIX",
};

export function normalizeIata(code: string): string {
  const c = code.trim().toUpperCase();
  return METRO_TO_AIRPORT[c] ?? c;
}

export { mdRadarAvailable, MdCancelledError };

/**
 * Adaptador fino: toda ida ao Melhores Destinos passa pela camada
 * compartilhada (cache, coalescência, fila única, ritmo 15–30s e backoff).
 */
async function getJson<T>(url: string, cancel?: MdCancel): Promise<T> {
  return mdFetchJson<T>(url, { priority: "background", cancel });
}



type RawCategories = {
  from_city_name?: string | null;
  categories?: Array<{ name?: string; link?: string; cheapest_itinerary_price?: number | null }>;
  cities?: Array<{ to_city_name?: string; total_price?: number | null; link?: string }>;
};

type RawDates = {
  months?: Array<{
    month?: string;
    year?: number;
    dates?: Array<{
      departure?: string;
      arrival?: string | null;
      price?: number;
      link?: string;
      luggage_type?: string | null;
      airline_code?: string | null;
    }>;
  }>;
};

function categoryIdFromLink(link?: string | null): number | null {
  const m = /category_id=(\d+)/.exec(String(link ?? ""));
  return m ? Number(m[1]) : null;
}

function iataFromItineraryLink(link?: string | null): { from: string | null; to: string | null } {
  const m = /itinerary_prices\/([A-Z]{3})\/([A-Z]{3})/i.exec(String(link ?? ""));
  return m ? { from: m[1]!.toUpperCase(), to: m[2]!.toUpperCase() } : { from: null, to: null };
}

export type DestinationLead = {
  origin_iata: string;
  origin_city: string | null;
  destination_iata: string;
  destination_city: string | null;
  scope: "nacional" | "internacional";
  reference_price: number | null;
  category_id: number | null;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]!);
      } catch {
        out[idx] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return out.filter((r) => r !== undefined);
}

/**
 * Varre TODAS as categorias (e subcategorias) do Melhores Destinos filtradas
 * pela origem e devolve todos os destinos monitorados com preço de referência.
 */
export async function radarByOrigin(origin: string, opts?: { maxDepth?: number }): Promise<DestinationLead[]> {
  const from = origin.trim().toUpperCase();
  const maxDepth = opts?.maxDepth ?? 2;
  const leads = new Map<string, DestinationLead>();
  let originCity: string | null = null;

  const visitadas = new Set<string>();

  const visit = async (categoryId: number | null, depth: number): Promise<void> => {
    const chave = `${categoryId ?? "root"}`;
    if (visitadas.has(chave) || depth > maxDepth) return;
    visitadas.add(chave);

    const params = new URLSearchParams({ from_iata_code: from });
    if (categoryId) params.set("category_id", String(categoryId));
    let json: RawCategories;
    try {
      json = await getJson<RawCategories>(`${TWD}/categories?${params.toString()}`);
    } catch {
      // uma categoria que não respondeu não pode derrubar a origem inteira
      return;
    }
    originCity = originCity ?? json.from_city_name ?? null;

    for (const city of json.cities ?? []) {
      const { to } = iataFromItineraryLink(city.link);
      if (!to) continue;
      const destination = normalizeIata(to);
      if (destination === from || destination.length !== 3) continue;
      const preco = typeof city.total_price === "number" ? city.total_price : null;
      const atual = leads.get(destination);
      if (!atual || (preco ?? Infinity) < (atual.reference_price ?? Infinity)) {
        leads.set(destination, {
          origin_iata: from,
          origin_city: originCity,
          destination_iata: destination,
          destination_city: city.to_city_name ?? null,
          scope: scopeOfRoute(from, destination),
          reference_price: preco,
          category_id: categoryIdFromLink(city.link),
        });
      }
    }

    const subs = (json.categories ?? [])
      .map((c) => categoryIdFromLink(c.link))
      .filter((id): id is number => !!id);
    await mapLimit(subs, 2, (id) => visit(id, depth + 1));
  };

  await visit(null, 0);
  return [...leads.values()];
}

export type LeadDate = {
  departDate: string;
  returnDate: string | null;
  price: number | null;
  baggage: string | null;
  airline: string | null;
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function datesFromLink(link?: string | null): { depart: string | null; ret: string | null } {
  const url = String(link ?? "");
  const all = url.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const d1 = /[?&]Date1=([^&]+)/i.exec(url)?.[1];
  const d2 = /[?&]Date2=([^&]+)/i.exec(url)?.[1];
  const ok = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    depart: ok(d1 && decodeURIComponent(d1)) ?? ok(all[0]),
    ret: ok(d2 && decodeURIComponent(d2)) ?? ok(all[1]),
  };
}

/** Datas reais mais baratas de uma rota (usadas só para as candidatas escolhidas). */
export async function cheapestDatesForLead(lead: DestinationLead, count = 1): Promise<LeadDate[]> {
  const params = new URLSearchParams();
  if (lead.category_id) params.set("category_id", String(lead.category_id));
  const json = await getJson<RawDates>(
    `${TWD}/itinerary_prices/${lead.origin_iata}/${lead.destination_iata}${
      params.toString() ? `?${params}` : ""
    }`,
  );

  const hoje = isoToday();
  const todas: LeadDate[] = [];
  for (const m of json.months ?? []) {
    for (const d of m.dates ?? []) {
      const { depart, ret } = datesFromLink(d.link);
      if (!depart || depart < hoje) continue;
      todas.push({
        departDate: depart,
        returnDate: ret,
        price: typeof d.price === "number" ? d.price : null,
        baggage: d.luggage_type ?? null,
        airline: d.airline_code ?? null,
      });
    }
  }
  todas.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

  const vistas = new Set<string>();
  const saida: LeadDate[] = [];
  for (const d of todas) {
    const k = `${d.departDate}|${d.returnDate ?? "-"}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push(d);
    if (saida.length >= count) break;
  }
  return saida;
}

export { mapLimit };
