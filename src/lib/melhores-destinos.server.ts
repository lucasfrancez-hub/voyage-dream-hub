/**
 * Melhores Destinos — coleta automática (sem colar link).
 *
 * Usa as próprias APIs públicas do site:
 *  - lista de promoções: /wp-admin/admin-ajax.php?action=get_promos_passagens&page=N
 *  - trechos mais baratos: passagensaereas.../cheapest_prices_json?key=KEY
 *  - datas por trecho:     passagensaereas.../passagens_json/ORI/DES/?key=KEY
 *
 * Cada oferta sai com o link do nosso motor (Comprar Viagem) no lugar do
 * link do parceiro (CVC, ViajaNet...).
 */
import { z } from "zod";
import { viaairFlightUrl, viaairRouteUrl } from "@/lib/melhores-destinos.parse";

const SITE = "https://www.melhoresdestinos.com.br";
const API = "https://passagensaereas.melhoresdestinos.com.br";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function get(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "*/*", referer: `${SITE}/` },
  });
  if (!res.ok) throw new Error(`Melhores Destinos respondeu ${res.status} em ${url}`);
  return res;
}

async function getJson<T>(url: string): Promise<T> {
  return (await (await get(url)).json()) as T;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/* ------------------------------ tipos ------------------------------ */

export type MdRoute = {
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  price: number;
  currency: string;
  /** Link do nosso motor (sem datas — abre a busca do trecho) */
  viaairUrl: string;
};

export type MdPromo = {
  key: string | null;
  title: string;
  url: string;
  image: string | null;
  publishedAt: number | null;
  ageLabel: string;
  updatedAt: string | null;
  routes: MdRoute[];
  error?: string;
};

export type MdDate = {
  departDate: string;
  returnDate: string | null;
  departLabel: string;
  returnLabel: string | null;
  weekdayOut: string | null;
  weekdayIn: string | null;
  nights: number | null;
  baggage: string | null;
  airline: string | null;
  airlineLogo: string | null;
  price: number;
  currency: string;
  partner: string | null;
  partnerUrl: string;
  viaairUrl: string;
};

export type MdMonthDates = { label: string; price: number | null; cheapest: boolean };

export type MdRouteDates = {
  originCode: string;
  destinationCode: string;
  originName: string;
  destinationName: string;
  promoUrl: string | null;
  months: MdMonthDates[];
  dates: MdDate[];
};

/* ---------------------------- promoções ---------------------------- */

type RawPromo = {
  link?: string;
  title?: string;
  thumb?: unknown;
  ts?: number;
  date?: string;
};

type RawCheapest = {
  ativa?: boolean;
  data_hora?: string;
  resumo_tarifas_ativas?: Array<{
    total_price?: number;
    from_city_code?: string;
    from_city_name?: string;
    to_city_name?: string;
    to_city_codes?: string;
    total_price_currency_display?: string;
  }>;
};

async function promoKey(url: string): Promise<string | null> {
  const html = await (await get(url)).text();
  const m = /publication_json\s*=\s*(\{[\s\S]*?\});/.exec(html);
  if (!m) return null;
  try {
    return (JSON.parse(m[1]) as { key?: string }).key ?? null;
  } catch {
    return /"key"\s*:\s*"([a-z0-9]+)"/i.exec(m[1])?.[1] ?? null;
  }
}

async function routesForKey(key: string, base: string) {
  const data = await getJson<RawCheapest>(`${API}/cheapest_prices_json?key=${encodeURIComponent(key)}`);
  const routes: MdRoute[] = (data.resumo_tarifas_ativas ?? [])
    .filter((r) => r.from_city_code && r.to_city_codes)
    .map((r) => ({
      originCode: String(r.from_city_code),
      originName: String(r.from_city_name ?? r.from_city_code),
      destinationCode: String(r.to_city_codes),
      destinationName: String(r.to_city_name ?? r.to_city_codes),
      price: Number(r.total_price ?? 0),
      currency: String(r.total_price_currency_display ?? "R$"),
      viaairUrl: viaairRouteUrl(String(r.from_city_code), String(r.to_city_codes), {
        originName: r.from_city_name ?? null,
        destinationName: r.to_city_name ?? null,
      }),
    }))
    .sort((a, b) => a.price - b.price);
  return { routes, updatedAt: data.data_hora ?? null };
}

export const listarPromocoesInput = z.object({
  /** Quantas páginas da listagem buscar (6 promoções por página) */
  pages: z.number().int().min(1).max(6).default(2),
  base: z.string().max(200).optional(),
});
export type ListarPromocoesInput = z.infer<typeof listarPromocoesInput>;

export async function listarPromocoesHandler({
  data,
}: {
  data: ListarPromocoesInput;
}): Promise<{ updatedAt: string; promos: MdPromo[] }> {
  const base = (data.base ?? "").replace(/\/$/, "");

  const pages = await Promise.all(
    Array.from({ length: data.pages }, (_, i) =>
      getJson<RawPromo[]>(
        `${SITE}/wp-admin/admin-ajax.php?action=get_promos_passagens${i ? `&page=${i + 1}` : ""}`,
      ).catch(() => [] as RawPromo[]),
    ),
  );

  const seen = new Set<string>();
  const raw = pages.flat().filter((p) => {
    const url = p.link ?? "";
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  const promos: MdPromo[] = [];
  const size = 4;
  for (let i = 0; i < raw.length; i += size) {
    const slice = raw.slice(i, i + size);
    const done = await Promise.all(
      slice.map(async (p): Promise<MdPromo> => {
        const url = String(p.link);
        const thumb = Array.isArray(p.thumb) ? String(p.thumb[0] ?? "") : "";
        const promo: MdPromo = {
          key: null,
          title: decodeEntities(String(p.title ?? "")),
          url,
          image: thumb || null,
          publishedAt: typeof p.ts === "number" ? p.ts : null,
          ageLabel: String(p.date ?? ""),
          updatedAt: null,
          routes: [],
        };
        try {
          const key = await promoKey(url);
          promo.key = key;
          if (key) {
            const { routes, updatedAt } = await routesForKey(key, base);
            promo.routes = routes;
            promo.updatedAt = updatedAt;
          }
        } catch (e) {
          promo.error = e instanceof Error ? e.message : "Falha ao ler a promoção";
        }
        return promo;
      }),
    );
    promos.push(...done);
  }

  return {
    updatedAt: new Date().toISOString(),
    promos: promos.filter((p) => p.routes.length > 0 || p.error),
  };
}

/* ------------------------------ datas ------------------------------ */

type RawDates = {
  publication_url?: string;
  from_city_name?: string;
  to_city_name?: string;
  months?: Array<{
    month?: string;
    year?: number;
    price?: number | null;
    cheapest?: boolean;
    dates?: Array<{
      luggage_type?: string | null;
      departure?: string;
      departure_txt?: string;
      arrival?: string | null;
      arrival_txt?: string | null;
      stay?: number | null;
      price?: number;
      price_currency?: string;
      airline_code?: string | null;
      airline_icon_url?: string | null;
      link?: string;
      provider_name?: string | null;
    }>;
  }>;
};

function isoFromPartnerUrl(url: string): { depart: string | null; ret: string | null } {
  const all = url.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const d1 = /[?&]Date1=([^&]+)/i.exec(url)?.[1];
  const d2 = /[?&]Date2=([^&]+)/i.exec(url)?.[1];
  const ok = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    depart: ok(d1 && decodeURIComponent(d1)) ?? ok(all[0]),
    ret: ok(d2 && decodeURIComponent(d2)) ?? ok(all[1]),
  };
}

function baggageLabel(type?: string | null): string | null {
  if (!type) return null;
  if (/checked/i.test(type)) return "Com bagagem despachada";
  if (/carry|hand/i.test(type)) return "Somente bagagem de mão";
  return type;
}

export const datasDaRotaInput = z.object({
  key: z.string().min(4).max(64),
  from: z.string().min(3).max(4),
  to: z.string().min(3).max(4),
  base: z.string().max(200).optional(),
});
export type DatasDaRotaInput = z.infer<typeof datasDaRotaInput>;

export async function datasDaRotaHandler({
  data,
}: {
  data: DatasDaRotaInput;
}): Promise<MdRouteDates> {
  const base = (data.base ?? "").replace(/\/$/, "");
  const from = data.from.toUpperCase();
  const to = data.to.toUpperCase();
  const json = await getJson<RawDates>(
    `${API}/passagens_json/${from}/${to}/?key=${encodeURIComponent(data.key)}`,
  );

  const months: MdMonthDates[] = [];
  const dates: MdDate[] = [];
  const seen = new Set<string>();

  for (const m of json.months ?? []) {
    months.push({
      label: `${m.month ?? ""}/${m.year ?? ""}`.replace(/\/$/, ""),
      price: typeof m.price === "number" ? m.price : null,
      cheapest: !!m.cheapest,
    });
    for (const d of m.dates ?? []) {
      const partnerUrl = String(d.link ?? "");
      const { depart, ret } = isoFromPartnerUrl(partnerUrl);
      if (!depart) continue;
      const k = `${depart}|${ret}|${d.price}`;
      if (seen.has(k)) continue;
      seen.add(k);
      dates.push({
        departDate: depart,
        returnDate: ret,
        departLabel: String(d.departure ?? depart),
        returnLabel: d.arrival ? String(d.arrival) : null,
        weekdayOut: d.departure_txt ?? null,
        weekdayIn: d.arrival_txt ?? null,
        nights: typeof d.stay === "number" ? d.stay : null,
        baggage: baggageLabel(d.luggage_type),
        airline: d.airline_code ?? null,
        airlineLogo: d.airline_icon_url ?? null,
        price: Number(d.price ?? 0),
        currency: String(d.price_currency ?? "R$"),
        partner: d.provider_name ?? null,
        partnerUrl,
        viaairUrl: viaairFlightUrl(from, to, depart, ret, base, {
          originName: json.from_city_name ?? null,
          destinationName: json.to_city_name ?? null,
        }),
      });
    }
  }

  dates.sort((a, b) => a.price - b.price);

  return {
    originCode: from,
    destinationCode: to,
    originName: json.from_city_name ?? from,
    destinationName: json.to_city_name ?? to,
    promoUrl: json.publication_url ?? null,
    months,
    dates,
  };
}

/* --------------------- explorar (regiões → destinos) --------------------- */

const TWD = `${API}/api/v1/twd/web`;

export type MdCategory = {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  price: number | null;
  foundAt: string | null;
};

export type MdCity = {
  toName: string;
  toIata: string | null;
  fromName: string | null;
  fromIata: string | null;
  price: number | null;
  viaairUrl: string | null;
};

export type MdExplore = {
  level: "categories" | "cities" | "origins" | "prices";
  title: string;
  parentCategoryId: number | null;
  categories: MdCategory[];
  cities: MdCity[];
  months: MdMonthDates[];
  dates: MdDate[];
};

function categoryIdFromLink(link?: string | null): number | null {
  const m = /category_id=(\d+)/.exec(String(link ?? ""));
  return m ? Number(m[1]) : null;
}

function iataFromLink(link?: string | null, which: "to" | "from" = "to"): string | null {
  const url = String(link ?? "");
  const q = new RegExp(`${which}_iata_code=([A-Z]{3})`, "i").exec(url);
  if (q) return q[1].toUpperCase();
  const it = /itinerary_prices\/([A-Z]{3})\/([A-Z]{3})/i.exec(url);
  if (it) return (which === "from" ? it[1] : it[2]).toUpperCase();
  return null;
}

export const explorarInput = z.object({
  categoryId: z.number().int().positive().optional(),
  toIata: z.string().min(3).max(4).optional(),
  fromIata: z.string().min(3).max(4).optional(),
  originIata: z.string().min(3).max(4).optional(),
  month: z.string().max(10).optional(),
  base: z.string().max(200).optional(),
});

export type ExplorarInput = z.infer<typeof explorarInput>;

type RawTwd = {
  to_name?: string | null;
  to_city_name?: string | null;
  from_city_name?: string | null;
  from_iata_code?: string | null;
  to_iata_code?: string | null;
  parent_category_link?: string | null;
  categories?: Array<{
    name?: string;
    description?: string | null;
    image?: string | null;
    cheapest_itinerary_price?: number | null;
    cheapest_itinerary_price_found_at?: string | null;
    link?: string;
  }>;
  cities?: Array<{
    to_city_name?: string;
    from_city_name?: string | null;
    total_price?: number | null;
    link?: string;
  }>;
  months?: RawDates["months"];
};

export async function explorarHandler({ data }: { data: ExplorarInput }): Promise<MdExplore> {
  const base = (data.base ?? "").replace(/\/$/, "");
  const params = new URLSearchParams();
  if (data.categoryId) params.set("category_id", String(data.categoryId));
  if (data.toIata) params.set("to_iata_code", data.toIata.toUpperCase());
  if (data.month) params.set("month", data.month);
  if (!data.fromIata && data.originIata) params.set("from_iata_code", data.originIata.toUpperCase());


  const url = data.fromIata
    ? `${TWD}/itinerary_prices/${data.fromIata.toUpperCase()}/${(data.toIata ?? "").toUpperCase()}?${params.toString()}`
    : `${TWD}/categories${params.toString() ? `?${params}` : ""}`;

  const json = await getJson<RawTwd>(url);
  const parentCategoryId = categoryIdFromLink(json.parent_category_link);

  const out: MdExplore = {
    level: "categories",
    title: json.to_city_name
      ? `${json.from_city_name ? `${json.from_city_name} → ` : ""}${json.to_city_name}`
      : (json.to_name ?? "Passagens aéreas baratas"),
    parentCategoryId,
    categories: [],
    cities: [],
    months: [],
    dates: [],
  };

  if (json.categories?.length) {
    out.level = "categories";
    out.categories = json.categories
      .map((c) => ({
        id: categoryIdFromLink(c.link) ?? 0,
        name: decodeEntities(String(c.name ?? "")),
        description: c.description ? decodeEntities(c.description) : null,
        image: c.image ?? null,
        price: typeof c.cheapest_itinerary_price === "number" ? c.cheapest_itinerary_price : null,
        foundAt: c.cheapest_itinerary_price_found_at ?? null,
      }))
      .filter((c) => c.id > 0);
    return out;
  }

  if (json.cities?.length) {
    const origins = json.cities.some((c) => c.from_city_name);
    out.level = origins ? "origins" : "cities";
    out.cities = json.cities.map((c) => {
      const to = iataFromLink(c.link, "to");
      const from = iataFromLink(c.link, "from");
      return {
        toName: decodeEntities(String(c.to_city_name ?? "")),
        toIata: to,
        fromName: c.from_city_name ? decodeEntities(c.from_city_name) : null,
        fromIata: from,
        price: typeof c.total_price === "number" ? c.total_price : null,
        viaairUrl:
          from && to
            ? viaairRouteUrl(from, to, {
                originName: c.from_city_name ?? null,
                destinationName: c.to_city_name ?? null,
              })
            : null,
      };
    });
    return out;
  }

  if (json.months?.length) {
    out.level = "prices";
    const from = String(json.from_iata_code ?? data.fromIata ?? "").toUpperCase();
    const to = String(json.to_iata_code ?? data.toIata ?? "").toUpperCase();
    const seen = new Set<string>();
    for (const m of json.months) {
      out.months.push({
        label: `${m.month ?? ""}/${m.year ?? ""}`.replace(/\/$/, ""),
        price: typeof m.price === "number" ? m.price : null,
        cheapest: !!m.cheapest,
      });
      for (const d of m.dates ?? []) {
        const partnerUrl = String(d.link ?? "");
        const { depart, ret } = isoFromPartnerUrl(partnerUrl);
        if (!depart) continue;
        const k = `${depart}|${ret}|${d.price}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.dates.push({
          departDate: depart,
          returnDate: ret,
          departLabel: String(d.departure ?? depart),
          returnLabel: d.arrival ? String(d.arrival) : null,
          weekdayOut: d.departure_txt ?? null,
          weekdayIn: d.arrival_txt ?? null,
          nights: typeof d.stay === "number" ? d.stay : null,
          baggage: baggageLabel(d.luggage_type),
          airline: d.airline_code ?? null,
          airlineLogo: d.airline_icon_url ?? null,
          price: Number(d.price ?? 0),
          currency: String(d.price_currency ?? "R$"),
          partner: d.provider_name ?? null,
          partnerUrl,
          viaairUrl: viaairFlightUrl(from, to, depart, ret, base, {
            originName: json.from_city_name ?? null,
            destinationName: json.to_city_name ?? null,
          }),
        });
      }
    }
    out.dates.sort((a, b) => a.price - b.price);
    return out;
  }

  return out;
}
