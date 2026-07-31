import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Hotéis na operadora Öner Travel (Comprar Viagem / VIA AIR).
 * API interna descoberta por inspeção das chamadas do site:
 *
 *  1) GET  api/pointOfInterest/{nome}                  -> destinos (cidade/POI)
 *  2) POST serverless/api/hotel/v1/search              -> { data: searchKey }
 *  3) POST serverless/api/hotel/v1/search/{searchKey}  -> lista paginada
 *  4) GET  .../search/{key}/hotel/{id}/data            -> fotos e endereço
 */

const API = "https://api.onertravel.com";
const SERVERLESS = "https://serverless.api.onertravel.com";
const INSTITUTION_ID = "23";
const AGENT_ID = "83956";

function headers(locationHref: string): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    authorization: "Bearer",
    institutionid: INSTITUTION_ID,
    agentid: AGENT_ID,
    applicationname: "COMPRARVIAGEM",
    applicationaccesstype: "1",
    platform: "WEBAPP",
    language: "4",
    currencie: "1",
    currency: "1",
    ispackage: "false",
    referer: "https://www.comprarviagem.com.br/",
    origin: "https://www.comprarviagem.com.br",
    "x-location-href": locationHref,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- tipos

export type OnerHotelPoint = {
  id: string;
  type: number;
  name: string;
  description: string | null;
};

export type OnerRoomRate = {
  key: string;
  name: string;
  isPackage?: boolean;
  price: { total: number; totalPerNight: number };
  mealPlanLabel: string;
  refundable: boolean;
  cancelPolicy?: string | null;
};

export type OnerHotel = {
  hotelId: number;
  name: string;
  stars: number;
  numberOfNights: number;
  address?: string | null;
  city?: string | null;
  images: string[];
  tags: string[];
  lowestTotal: number;
  lowestPerNight: number;
  rates: OnerRoomRate[];
};

export type OnerHotelSearchResult = {
  searchKey: string;
  count: number;
  haveMore: boolean;
  hotels: OnerHotel[];
};

const MEAL_PLANS: Record<number, string> = {
  0: "Sem café da manhã",
  1: "Café da manhã",
  2: "Café da manhã",
  3: "Meia pensão",
  4: "Pensão completa",
  5: "All inclusive",
};

// ---------------------------------------------------------------- destinos

export const onerHotelDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().min(3) }).parse(d))
  .handler(async ({ data }): Promise<OnerHotelPoint[]> => {
    const res = await fetch(`${API}/api/pointOfInterest/${encodeURIComponent(data.query)}`, {
      headers: headers("https://www.comprarviagem.com.br/viaair/"),
    });
    if (!res.ok) throw new Error(`Falha ao buscar destinos (${res.status})`);
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    return (json.data ?? []).slice(0, 12).map((p) => ({
      id: String(p.id ?? ""),
      type: Number(p.type ?? 1),
      name: String(p.name ?? ""),
      description: (p.description as string | null) ?? null,
    }));
  });

// ---------------------------------------------------------------- busca

const RoomInput = z.object({
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(6).default(0),
  childrenAges: z.array(z.number().int().min(0).max(17)).default([]),
});

const HotelSearchInput = z.object({
  pointId: z.string().min(1),
  pointType: z.number().int().default(1),
  cityName: z.string().min(2),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rooms: z.array(RoomInput).min(1).max(5),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(50).default(20),
  /** Reaproveita uma busca já iniciada (paginação "ver mais"). */
  searchKey: z.string().nullish(),

  hotelName: z.string().default(""),
  stars: z.array(z.number().int().min(1).max(5)).default([]),
  priceBegin: z.number().nullable().default(null),
  priceEnd: z.number().nullable().default(null),
  mealPlans: z.array(z.number().int()).default([]),
  sortingCode: z.string().default(""),
});

function buildLoc(p: z.infer<typeof HotelSearchInput>) {
  const q = new URLSearchParams({
    numberOfAdults: String(p.rooms.reduce((a, r) => a + r.adults, 0)),
    numberOfChild: String(p.rooms.reduce((a, r) => a + r.children, 0)),
    numberOfInfant: "0",
    numberOfRooms: String(p.rooms.length),
    cityName: p.cityName,
    id: p.pointId,
    type: String(p.pointType),
    startDate: `${p.checkIn}T00:00:00.000Z`,
    endDate: `${p.checkOut}T00:00:00.000Z`,
    source: "h",
  });
  return `https://www.comprarviagem.com.br/viaair/hotel-list?${q.toString()}`;
}

export const onerHotelSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => HotelSearchInput.parse(d))
  .handler(async ({ data }): Promise<OnerHotelSearchResult> => {
    const loc = buildLoc(data);
    const h = headers(loc);

    const rooms = data.rooms.map((r, i) => ({
      numberOfAdults: r.adults,
      numberOfInfant: 0,
      numberOfChilds: r.children,
      roomNum: i,
      agesOfChild: r.childrenAges,
      arrNumberChildren: r.childrenAges,
    }));

    let searchKey = data.searchKey ?? "";

    if (!searchKey) {
      const startRes = await fetch(`${SERVERLESS}/api/hotel/v1/search`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          numberOfAdults: data.rooms.reduce((a, r) => a + r.adults, 0),
          numberOfChild: data.rooms.reduce((a, r) => a + r.children, 0),
          numberOfInfant: 0,
          numberOfRooms: data.rooms.length,
          rooms,
          cityName: data.cityName,
          id: data.pointId,
          type: data.pointType,
          startDate: `${data.checkIn}T00:00:00.000Z`,
          endDate: `${data.checkOut}T00:00:00.000Z`,
          source: "h",
          refresh: Date.now(),
        }),
      });

      const startJson = (await startRes.json().catch(() => null)) as { data?: string } | null;
      searchKey = startJson?.data ?? "";
      if (!searchKey) {
        throw new Error(`A operadora não retornou chave de busca (HTTP ${startRes.status}).`);
      }
    }

    const listBody = {
      searchKey,
      page: data.page,
      totalPerPage: data.perPage,
      filters: {
        hotelName: data.hotelName,
        stars: data.stars,
        priceBegin: data.priceBegin,
        priceEnd: data.priceEnd,
        mealPlans: data.mealPlans,
        sortingCode: data.sortingCode,
        codes: [],
      },
    };

    // Os fornecedores respondem em ondas e cada resposta é um recorte parcial:
    // acumulamos a união por hotelId até o conjunto estabilizar.
    const acc = new Map<number, { hotelId?: number }>();
    let count = 0;
    let haveMore = false;
    let stable = 0;
    // paginação já carregada não precisa de tantas rodadas
    const rounds = data.page > 1 ? 6 : 14;

    const fetchPage = async (page: number) => {
      const res = await fetch(`${SERVERLESS}/api/hotel/v1/search/${searchKey}`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ ...listBody, page }),
      });
      if (!res.ok) return 0;
      const json = (await res.json().catch(() => null)) as {
        data?: { hotels?: { hotelId?: number }[]; count?: number; haveMore?: boolean };
      } | null;
      const d = json?.data;
      const before = acc.size;
      for (const raw of d?.hotels ?? []) {
        if (typeof raw?.hotelId === "number") acc.set(raw.hotelId, raw);
      }
      count = Math.max(count, d?.count ?? 0);
      if (d?.haveMore !== undefined) haveMore = !!d.haveMore;
      return acc.size - before;
    };

    for (let i = 0; i < rounds; i++) {
      const added = await fetchPage(data.page);
      if (added > 0) stable = 0;
      else if (acc.size > 0) {
        stable++;
        if (i >= 3 && stable >= 4) break;
      }
      await sleep(1800);
    }

    // Puxa automaticamente as páginas seguintes até cobrir tudo que a operadora
    // diz existir (é o equivalente a clicar "ver mais" várias vezes).
    let nextPage = data.page + 1;
    const maxPage = data.page + 9;
    while (acc.size < count && nextPage <= maxPage) {
      const added = await fetchPage(nextPage);
      if (added === 0) {
        await sleep(1200);
        if ((await fetchPage(nextPage)) === 0) break;
      }
      nextPage++;
    }
    haveMore = acc.size < count;


    type RawRate = {
      key?: string;
      name?: string;
      isPackage?: boolean;
      price?: { total?: number; totalPerNight?: number };
      mealPlan?: { type?: number; description?: string | null };
      cancelPolicy?: { refundable?: boolean; description?: string | null };
    };
    type RawHotel = {
      hotelId?: number;
      name?: string;
      stars?: number;
      numberOfNights?: number;
      lowestPrice?: { total?: number; totalPerNight?: number };
      tags?: Array<{ displayName?: string }>;
      rooms?: Array<{ roomRates?: RawRate[] }>;
    };

    const hotels: OnerHotel[] = ([...acc.values()] as RawHotel[]).map((raw) => {
      const rates: OnerRoomRate[] = (raw.rooms ?? [])
        .flatMap((r) => r.roomRates ?? [])
        .map((rt) => ({
          key: rt.key ?? "",
          name: rt.name ?? "Quarto",
          isPackage: rt.isPackage,
          price: {
            total: rt.price?.total ?? 0,
            totalPerNight: rt.price?.totalPerNight ?? 0,
          },
          mealPlanLabel:
            rt.mealPlan?.description ?? MEAL_PLANS[rt.mealPlan?.type ?? 0] ?? "Consultar refeições",
          refundable: !!rt.cancelPolicy?.refundable,
          cancelPolicy: rt.cancelPolicy?.description ?? null,
        }));
      return {
        hotelId: raw.hotelId ?? 0,
        name: raw.name ?? "Hotel",
        stars: raw.stars ?? 0,
        numberOfNights: raw.numberOfNights ?? 0,
        images: [],
        tags: (raw.tags ?? []).map((t) => t.displayName ?? "").filter(Boolean),
        lowestTotal: raw.lowestPrice?.total ?? rates[0]?.price.total ?? 0,
        lowestPerNight: raw.lowestPrice?.totalPerNight ?? rates[0]?.price.totalPerNight ?? 0,
        rates,
      };
    });

    // fotos e endereço (best-effort, em paralelo)
    await Promise.all(
      hotels.map(async (hotel) => {
        try {
          const res = await fetch(
            `${SERVERLESS}/api/hotel/v1/search/${searchKey}/hotel/${hotel.hotelId}/data`,
            { headers: h },
          );
          if (!res.ok) return;
          const json = (await res.json().catch(() => null)) as {
            data?: {
              address?: unknown;
              city?: unknown;
              images?: Array<string | { url?: string; path?: string }>;
            };
          } | null;
          const d = json?.data;
          if (!d) return;
          // a operadora às vezes devolve address/city como objeto — achatamos em texto
          const flat = (v: unknown): string | null => {
            if (!v) return null;
            if (typeof v === "string") return v.trim() || null;
            if (typeof v === "number") return String(v);
            if (typeof v === "object") {
              const o = v as Record<string, unknown>;
              const parts = [o.street, o.address, o.name, o.number, o.district, o.neighborhood, o.city, o.state]
                .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""))
                .filter(Boolean);
              return parts.length ? [...new Set(parts)].join(", ") : null;
            }
            return null;
          };
          hotel.address = flat(d.address);
          hotel.city = flat(d.city);

          hotel.images = (d.images ?? [])
            .map((img) => (typeof img === "string" ? img : (img.url ?? img.path ?? "")))
            .filter(Boolean)
            .slice(0, 5);
        } catch {
          /* detalhe é opcional */
        }
      }),
    );

    return { searchKey, count, haveMore, hotels };
  });

// ---------------------------------------------------------------- carrinho

const HotelCartInput = z.object({
  searchKey: z.string().min(5),
  hotelId: z.number().int(),
  rateKeys: z.array(z.string().min(3)).min(1),
  cityName: z.string().default(""),
  pointId: z.string().default(""),
  pointType: z.number().int().default(1),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.number().int().default(2),
  children: z.number().int().default(0),
  rooms: z.number().int().default(1),
});

/* Cria o carrinho oficial da hospedagem escolhida e devolve a URL pública
   /viaair/hotel-cart?newCartId=... para enviar ao cliente. */
export const onerCreateHotelCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => HotelCartInput.parse(d))
  .handler(async ({ data }): Promise<{ cartId: string; url: string }> => {
    const ctx = new URLSearchParams({
      numberOfAdults: String(data.adults),
      numberOfChild: String(data.children),
      numberOfInfant: "0",
      numberOfRooms: String(data.rooms),
      cityName: data.cityName,
      id: data.pointId,
      type: String(data.pointType),
      startDate: `${data.checkIn}T00:00:00.000Z`,
      endDate: `${data.checkOut}T00:00:00.000Z`,
      source: "h",
    });
    const loc = `https://www.comprarviagem.com.br/viaair/hotel-list?${ctx.toString()}`;

    // A operadora já mudou o formato do corpo algumas vezes; tentamos as
    // variações conhecidas e ficamos com a primeira que devolver o carrinho.
    const bodies: Record<string, unknown>[] = [
      {
        hotel: { searchKey: data.searchKey, hotelId: data.hotelId, roomRateKeys: data.rateKeys },
        searchBookingKey: null,
        affiliateTag: null,
        eventId: null,
      },
      {
        hotel: { searchKey: data.searchKey, hotelId: data.hotelId, keys: data.rateKeys },
        searchBookingKey: null,
        affiliateTag: null,
        eventId: null,
      },
      {
        hotel: { searchKey: data.searchKey, hotelId: data.hotelId, key: data.rateKeys[0] },
        searchBookingKey: null,
        affiliateTag: null,
        eventId: null,
      },
    ];

    let cartId = "";
    let lastStatus = 0;
    for (const body of bodies) {
      const res = await fetch(`${API}/api/booking`, {
        method: "POST",
        headers: headers(loc),
        body: JSON.stringify(body),
      });
      lastStatus = res.status;
      const text = await res.text();
      try {
        cartId = (JSON.parse(text) as { data?: string }).data ?? "";
      } catch {
        cartId = "";
      }
      if (res.ok && cartId) break;
      cartId = "";
    }

    if (!cartId) {
      throw new Error(
        `A operadora não gerou o carrinho da hospedagem (tarifa pode ter expirado, HTTP ${lastStatus}). Refaça a busca e tente de novo.`,
      );
    }

    const cartQuery = new URLSearchParams({ newCartId: cartId });
    ctx.forEach((v, k) => cartQuery.set(k, v));
    return { cartId, url: `https://www.comprarviagem.com.br/viaair/hotel-cart?${cartQuery.toString()}` };
  });
