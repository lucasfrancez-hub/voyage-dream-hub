import { z } from "zod";

/**
 * Seguro viagem e Produtos Exclusivos (ingressos/eventos) da Öner Travel.
 *
 * Seguro:
 *   1) GET  api/travel_insurance/v1/destinations      -> regiões (Europa, Mundo...)
 *   2) POST api/travel_insurance/v1/search            -> { searchKey }
 *   3) GET  api/travel_insurance/v1?page&pageSize     -> produtos (header searchkey)
 *
 * Exclusivos (offline_product):
 *   1) GET  api/offline_product/v1/search/criteria    -> categorias + cidades
 *   2) POST api/offline_product/v1/search             -> { searchKey }
 *   3) GET  api/offline_product/v1?page&pageSize      -> produtos (header searchkey)
 */

const SERVERLESS = "https://serverless.api.onertravel.com";
const SITE = "https://www.comprarviagem.com.br/viaair";

function headers(searchKey?: string): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    authorization: "Bearer",
    institutionid: "23",
    agentid: "83956",
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
  if (searchKey) h.searchkey = searchKey;
  return h;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ================================================================ SEGUROS

export type InsuranceDestination = { id: number; name: string; category: number };

export type InsuranceCoverage = {
  name: string;
  description: string | null;
  isDMH: boolean;
  showInResults: boolean;
};

export type InsurancePlan = {
  uuid: string;
  description: string;
  categoryName: string;
  price: number;
  startDate: string;
  endDate: string;
  tags: string[];
  generalConditionsUrl: string | null;
  insurer: { name: string; code: string; logoUrl: string | null };
  destination: { code: string; name: string };
  coverages: InsuranceCoverage[];
};

export type InsuranceSearchResult = {
  searchKey: string;
  count: number;
  plans: InsurancePlan[];
  url: string;
};

export const insuranceSearchInput = z.object({
  destinationId: z.union([z.string(), z.number()]),
  destinationName: z.string().default(""),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  ages: z.array(z.number().int().min(0).max(120)).min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  ordering: z.number().int().default(1),
});

export type InsuranceSearchInput = z.infer<typeof insuranceSearchInput>;

export async function listInsuranceDestinations(): Promise<InsuranceDestination[]> {
  const res = await fetch(`${SERVERLESS}/api/travel_insurance/v1/destinations`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Falha ao carregar destinos do seguro (${res.status})`);
  const json = (await res.json()) as Array<Record<string, unknown>>;
  return (json ?? []).map((d) => ({
    id: Number(d.id ?? 0),
    name: String(d.name ?? ""),
    category: Number(d.category ?? 1),
  }));
}

function normalizePlan(raw: Record<string, any>): InsurancePlan {
  return {
    uuid: String(raw.uuid ?? ""),
    description: String(raw.description ?? "Plano de seguro"),
    categoryName: String(raw.categoryName ?? ""),
    price: Number(raw.price ?? 0),
    startDate: String(raw.startDate ?? ""),
    endDate: String(raw.endDate ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: unknown) => String(t)) : [],
    generalConditionsUrl: raw.generalConditionsUrl ?? null,
    insurer: {
      name: String(raw.insurer?.name ?? "Seguradora").trim(),
      code: String(raw.insurer?.code ?? ""),
      logoUrl: raw.insurer?.logoUrl ?? null,
    },
    destination: {
      code: String(raw.destination?.code ?? ""),
      name: String(raw.destination?.name ?? ""),
    },
    coverages: (raw.coverages ?? []).map((c: any) => ({
      name: String(c?.name ?? ""),
      description: (c?.description as string | null) ?? null,
      isDMH: !!c?.isDMH,
      showInResults: !!c?.showInResults,
    })),
  };
}

export function insuranceListUrl(data: InsuranceSearchInput) {
  const q = new URLSearchParams({
    destination: JSON.stringify({
      id: Number(data.destinationId),
      name: data.destinationName,
      category: 1,
    }),
    ages: JSON.stringify(data.ages),
    startDate: data.startDate,
    endDate: data.endDate,
    source: "i",
    refresh: String(Date.now()),
  });
  return `${SITE}/travel-insurance-list?${q.toString()}`;
}

export async function searchInsurance(
  data: InsuranceSearchInput,
): Promise<InsuranceSearchResult> {
  const initRes = await fetch(`${SERVERLESS}/api/travel_insurance/v1/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      ages: data.ages,
      destination: String(data.destinationId),
      startDate: data.startDate,
      endDate: data.endDate,
    }),
  });
  if (!initRes.ok) throw new Error(`Falha ao iniciar a busca de seguros (${initRes.status})`);
  const searchKey = ((await initRes.json()) as { searchKey?: string }).searchKey;
  if (!searchKey) throw new Error("A operadora não retornou a busca de seguros");

  const q = `page=${data.page}&pageSize=${data.pageSize}&ordering=${data.ordering}`;
  let out: InsuranceSearchResult = {
    searchKey,
    count: 0,
    plans: [],
    url: insuranceListUrl(data),
  };
  for (let round = 0; round < 8; round++) {
    const res = await fetch(`${SERVERLESS}/api/travel_insurance/v1?${q}`, {
      headers: headers(searchKey),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        count?: number;
        products?: Array<Record<string, any>>;
      };
      const plans = (json.products ?? []).map(normalizePlan);
      out = { ...out, count: Number(json.count ?? plans.length), plans };
      if (plans.length) return out;
    }
    await sleep(1500);
  }
  return out;
}

// ============================================================= EXCLUSIVOS

export type ExclusiveOption = { id: string; description: string };

export type ExclusiveCriteria = {
  categories: ExclusiveOption[];
  cities: ExclusiveOption[];
  dates: string[];
  participants: number[];
};

export type ExclusiveProduct = {
  uuid: string;
  title: string;
  subTitle: string;
  description: string;
  initialDate: string;
  finalDate: string;
  price: number;
  participants: number;
  images: string[];
  lastUnits: boolean;
  soldOut: boolean;
  featured: boolean;
  place: string;
  category: string;
};

export type ExclusiveSearchResult = {
  searchKey: string;
  count: number;
  products: ExclusiveProduct[];
  url: string;
};

export const exclusiveSearchInput = z.object({
  categoryId: z.string().nullish(),
  categoryName: z.string().nullish(),
  cityId: z.string().nullish(),
  cityName: z.string().nullish(),
  eventDate: z.string().nullish(),
  participants: z.number().int().min(1).nullish(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export type ExclusiveSearchInput = z.infer<typeof exclusiveSearchInput>;

export async function listExclusiveCriteria(): Promise<ExclusiveCriteria> {
  const res = await fetch(`${SERVERLESS}/api/offline_product/v1/search/criteria`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Falha ao carregar filtros dos exclusivos (${res.status})`);
  const json = (await res.json()) as Record<string, any>;
  const opt = (arr: any): ExclusiveOption[] =>
    (arr ?? []).map((o: any) => ({
      id: String(o?.id ?? ""),
      description: String(o?.description ?? ""),
    }));
  return {
    categories: opt(json.category),
    cities: opt(json.city),
    dates: (json.dates ?? []).map((d: unknown) => String(d)),
    participants: (json.participants ?? []).map((p: unknown) => Number(p)),
  };
}

function normalizeExclusive(raw: Record<string, any>): ExclusiveProduct {
  return {
    uuid: String(raw.uuid ?? ""),
    title: String(raw.title ?? "Produto exclusivo"),
    subTitle: String(raw.subTitle ?? ""),
    description: String(raw.description ?? ""),
    initialDate: String(raw.initialDate ?? ""),
    finalDate: String(raw.finalDate ?? ""),
    price: Number(raw.lowestPriceComputed ?? 0),
    participants: Number(raw.participants ?? 1),
    images: Array.isArray(raw.images) ? raw.images.map((i: unknown) => String(i)) : [],
    lastUnits: !!raw.lastUnits,
    soldOut: !!raw.soldOut,
    featured: !!raw.featuredTag,
    place: String(raw.place?.description ?? ""),
    category: String(raw.category?.description ?? ""),
  };
}

export function exclusiveListUrl(data: ExclusiveSearchInput) {
  const q = new URLSearchParams();
  if (data.cityId)
    q.set("city", JSON.stringify({ id: data.cityId, description: data.cityName ?? "" }));
  if (data.categoryId)
    q.set(
      "category",
      JSON.stringify({ id: data.categoryId, description: data.categoryName ?? "" }),
    );
  if (data.eventDate) q.set("eventDate", data.eventDate);
  if (data.participants) q.set("participants", String(data.participants));
  q.set("refresh", String(Date.now()));
  return `${SITE}/tickets?${q.toString()}`;
}

export async function searchExclusive(
  data: ExclusiveSearchInput,
): Promise<ExclusiveSearchResult> {
  const body: Record<string, unknown> = {};
  if (data.categoryId)
    body.category = [{ id: data.categoryId, description: data.categoryName ?? "" }];
  if (data.cityId) body.city = [{ id: data.cityId, description: data.cityName ?? "" }];
  if (data.eventDate) body.dates = [data.eventDate];
  if (data.participants) body.participants = [data.participants];

  const initRes = await fetch(`${SERVERLESS}/api/offline_product/v1/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!initRes.ok) throw new Error(`Falha ao iniciar a busca de exclusivos (${initRes.status})`);
  const searchKey = ((await initRes.json()) as { searchKey?: string }).searchKey;
  if (!searchKey) throw new Error("A operadora não retornou a busca de exclusivos");

  const q = `page=${data.page}&pageSize=${data.pageSize}`;
  let out: ExclusiveSearchResult = {
    searchKey,
    count: 0,
    products: [],
    url: exclusiveListUrl(data),
  };
  for (let round = 0; round < 6; round++) {
    const res = await fetch(`${SERVERLESS}/api/offline_product/v1?${q}`, {
      headers: headers(searchKey),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        count?: number;
        products?: Array<Record<string, any>>;
      };
      const products = (json.products ?? []).map(normalizeExclusive);
      out = { ...out, count: Number(json.count ?? products.length), products };
      if (products.length) return out;
    }
    await sleep(1500);
  }
  return out;
}
