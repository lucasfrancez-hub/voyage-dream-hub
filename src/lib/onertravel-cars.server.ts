import { z } from "zod";

/**
 * Locação de carros na operadora Öner Travel (Comprar Viagem / VIA AIR).
 * API interna mapeada a partir das chamadas do site:
 *
 *  1) GET  api/location/v1/car/{texto}     -> locais de retirada/devolução
 *  2) POST api/car/v1/search               -> { searchKey }
 *  3) POST api/car/v2/search/{searchKey}   -> lista paginada + faixa de preço
 *  4) GET  api/car/v1/search/{key}/filters -> facetas (categorias, locadoras...)
 */

const SERVERLESS = "https://serverless.api.onertravel.com";
const INSTITUTION_ID = "23";
const AGENT_ID = "83956";

function headers(): Record<string, string> {
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
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- tipos

export type OnerCarLocation = {
  value: string;
  type: number;
  categoryEnum: number;
  locationName: string;
  locationDescription: string | null;
  point: { latitude: number; longitude: number } | null;
};

export type OnerCarCoverage = { name: string; description: string };

export type OnerCar = {
  carKey: string;
  searchKey: string;
  vendor: { name: string; logoUrl: string | null; providerCode: string | null };
  name: string;
  imageUrl: string | null;
  categoryDescription: string;
  providerCarCode: string | null;
  passengerCount: number;
  bagCount: number;
  doorCount: number;
  airConditioning: boolean;
  transmissionDescription: string;
  fuelTypeDescription: string;
  unlimitedMileage: boolean;
  finalPrice: number;
  pricePerDay: number;
  currencyCode: string;
  pickup: { name: string; address: string | null; cityName: string | null; date: string; time: string };
  dropoff: { name: string; address: string | null; cityName: string | null; date: string; time: string };
  sameLocation: boolean;
  coverages: OnerCarCoverage[];
  guarantees: OnerCarCoverage[];
};

export type OnerCarSearchResult = {
  searchKey: string;
  count: number;
  haveMore: boolean;
  priceRange: { lowest: number; highest: number } | null;
  cars: OnerCar[];
};

// ---------------------------------------------------------------- inputs

export const carLocationInput = z.object({ query: z.string().min(2) });

export const carSearchInput = z.object({
  pickup: z.object({
    type: z.number().int(),
    iata: z.string().nullable().default(null),
    locationName: z.string(),
    point: z.object({ latitude: z.number(), longitude: z.number() }).nullable().default(null),
  }),
  dropoff: z
    .object({
      type: z.number().int(),
      iata: z.string().nullable().default(null),
      locationName: z.string(),
      point: z.object({ latitude: z.number(), longitude: z.number() }).nullable().default(null),
    })
    .nullable()
    .default(null),
  pickupDate: z.string().min(10),
  pickupTime: z.string().min(4).default("10:00"),
  returnDate: z.string().min(10),
  returnTime: z.string().min(4).default("10:00"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  ordination: z.number().int().default(1),
  searchKey: z.string().nullable().default(null),
  filters: z
    .object({
      startPrice: z.number().nullable().default(null),
      endPrice: z.number().nullable().default(null),
      unlimitedMilage: z.boolean().nullable().default(null),
      airConditioning: z.boolean().nullable().default(null),
      availableBagsCount: z.array(z.number()).default([]),
      categories: z.array(z.number()).default([]),
      fuelTypes: z.array(z.number()).default([]),
      transmissionTypes: z.array(z.number()).default([]),
      vendors: z.array(z.string()).default([]),
    })
    .default(() => ({
      startPrice: null,
      endPrice: null,
      unlimitedMilage: null,
      airConditioning: null,
      availableBagsCount: [],
      categories: [],
      fuelTypes: [],
      transmissionTypes: [],
      vendors: [],
    })),
});

export type CarSearchInput = z.infer<typeof carSearchInput>;

// ---------------------------------------------------------------- locais

export async function searchCarLocations(
  data: z.infer<typeof carLocationInput>,
): Promise<OnerCarLocation[]> {
  const res = await fetch(
    `${SERVERLESS}/api/location/v1/car/${encodeURIComponent(data.query.trim())}`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`Falha ao buscar locais (${res.status})`);
  const json = (await res.json()) as { searchLocations?: Array<Record<string, unknown>> };
  return (json.searchLocations ?? []).slice(0, 12).map((l) => ({
    value: String(l.value ?? ""),
    type: Number(l.type ?? 1),
    categoryEnum: Number(l.categoryEnum ?? 0),
    locationName: String(l.locationName ?? ""),
    locationDescription: (l.locationDescription as string | null) ?? null,
    point: (l.point as { latitude: number; longitude: number } | null) ?? null,
  }));
}

// ---------------------------------------------------------------- busca

function normalizeCar(raw: Record<string, any>): OnerCar {
  const d = raw.description ?? {};
  const r = raw.rate ?? {};
  const sd = raw.searchData ?? {};
  return {
    carKey: String(raw.carKey ?? ""),
    searchKey: String(raw.searchKey ?? ""),
    vendor: {
      name: String(raw.vendor?.name ?? "Locadora"),
      logoUrl: raw.vendor?.logoUrl ?? null,
      providerCode: raw.vendor?.providerCode ?? null,
    },
    name: String(d.name ?? "Veículo"),
    imageUrl: d.imageUrl ?? null,
    categoryDescription: String(d.categoryDescription ?? ""),
    providerCarCode: d.providerCarCode ?? null,
    passengerCount: Number(d.passengerCount ?? 0),
    bagCount: Number(d.bagCount ?? 0),
    doorCount: Number(d.doorCount ?? 0),
    airConditioning: !!d.airConditioning,
    transmissionDescription: String(d.transmissionTypeDescription ?? ""),
    fuelTypeDescription: String(d.fuelTypeDescription ?? ""),
    unlimitedMileage: !!r.unlimitedMileage,
    finalPrice: Number(raw.finalPrice ?? 0),
    pricePerDay: Number(raw.pricePerDay ?? 0),
    currencyCode: String(raw.currencyCode ?? "BRL"),
    pickup: {
      name: String(raw.pickupLocation?.name ?? ""),
      address: raw.pickupLocation?.address ?? null,
      cityName: raw.pickupLocation?.cityName ?? null,
      date: String(sd.pickupDate ?? ""),
      time: String(sd.pickupTime ?? ""),
    },
    dropoff: {
      name: String(raw.returnLocation?.name ?? ""),
      address: raw.returnLocation?.address ?? null,
      cityName: raw.returnLocation?.cityName ?? null,
      date: String(sd.returnDate ?? ""),
      time: String(sd.returnTime ?? ""),
    },
    sameLocation: !!raw.sameLocation,
    coverages: (r.coverages ?? []).map((c: any) => ({
      name: String(c?.name ?? ""),
      description: String(c?.description ?? ""),
    })),
    guarantees: (r.guarantees ?? []).map((c: any) => ({
      name: String(c?.name ?? ""),
      description: String(c?.description ?? ""),
    })),
  };
}

export async function searchCars(data: CarSearchInput): Promise<OnerCarSearchResult> {
  const toLoc = (l: CarSearchInput["pickup"]) => ({
    type: l.type,
    iata: l.iata,
    geoLocationPoint: l.point,
    locationName: l.locationName,
  });

  let searchKey = data.searchKey;
  if (!searchKey) {
    const initRes = await fetch(`${SERVERLESS}/api/car/v1/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        pickupDateAndTime: `${data.pickupDate}T${data.pickupTime}:00`,
        returnDateAndTime: `${data.returnDate}T${data.returnTime}:00`,
        isReturnDifferentLocation: !!data.dropoff,
        pickupLocation: toLoc(data.pickup),
        returnLocation: toLoc(data.dropoff ?? data.pickup),
      }),
    });
    if (!initRes.ok) throw new Error(`Falha ao iniciar a busca de carros (${initRes.status})`);
    const initJson = (await initRes.json()) as { searchKey?: string };
    if (!initJson.searchKey) throw new Error("A operadora não retornou a busca de carros");
    searchKey = initJson.searchKey;
  }

  const body = JSON.stringify({
    page: data.page,
    pageSize: data.pageSize,
    ordination: data.ordination,
    filters: {
      startPrice: data.filters.startPrice,
      endPrice: data.filters.endPrice,
      unlimitedMilage: data.filters.unlimitedMilage,
      airConditioning: data.filters.airConditioning,
      availableBagsCount: data.filters.availableBagsCount,
      categories: data.filters.categories,
      fuelTypes: data.filters.fuelTypes,
      transmissionTypes: data.filters.transmissionTypes,
      vendors: data.filters.vendors,
      pickupLocationTypes: [],
      returnLocationTypes: [],
      pickupLocationName: null,
      returnLocationName: null,
    },
  });

  // Os fornecedores publicam em ondas: insiste até vir conteúdo (ou esgotar).
  let last: OnerCarSearchResult = {
    searchKey,
    count: 0,
    haveMore: false,
    priceRange: null,
    cars: [],
  };
  for (let round = 0; round < 8; round++) {
    const res = await fetch(`${SERVERLESS}/api/car/v2/search/${searchKey}`, {
      method: "POST",
      headers: headers(),
      body,
    });
    if (res.ok) {
      const json = (await res.json()) as {
        count?: number;
        haveMore?: boolean;
        priceFilter?: { lowest: number; highest: number } | null;
        cars?: Array<Record<string, any>>;
      };
      const cars = (json.cars ?? []).map(normalizeCar);
      last = {
        searchKey,
        count: Number(json.count ?? cars.length),
        haveMore: !!json.haveMore,
        priceRange: json.priceFilter ?? null,
        cars,
      };
      if (cars.length) return last;
    }
    await sleep(1500);
  }
  return last;
}
