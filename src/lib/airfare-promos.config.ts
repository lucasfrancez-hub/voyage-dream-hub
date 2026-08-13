/**
 * CONFIGURAÇÃO CENTRAL DA CURADORIA DE PROMOÇÕES DE AÉREO.
 *
 * Fonte única de verdade para limites de coleta. Nada de "10" espalhado
 * pelo código: para mudar o volume por origem basta editar aqui.
 */

/** Limite padrão de oportunidades validadas no motor VIA AIR por origem/ciclo. */
export const MAX_OPPORTUNITIES_PER_ORIGIN = 10;

/**
 * Limite individual por origem (opcional). Sobrepõe o padrão acima.
 * Ex.: { CWB: 15, GRU: 20 }
 */
export const MAX_OPPORTUNITIES_BY_ORIGIN: Record<string, number> = {};

/** Origens nacionais prioritárias. */
export const PRIORITY_ORIGINS_NACIONAL = ["MGF", "LDB", "CWB", "CAC", "IGU"] as const;

/** Origens internacionais (hubs) prioritárias. */
export const PRIORITY_ORIGINS_HUB = ["GRU", "GIG", "SDU", "BSB", "CWB"] as const;

/** União das duas listas, já deduplicada (CWB participa das duas). */
export const PRIORITY_ORIGINS = [
  ...new Set<string>([...PRIORITY_ORIGINS_NACIONAL, ...PRIORITY_ORIGINS_HUB]),
];

/** Validações simultâneas no motor VIA AIR (~27,5s por oportunidade). */
export const PROMO_VALIDATION_CONCURRENCY = 3;

/** Limite de origens não prioritárias aproveitadas no mesmo ciclo. */
export const MAX_EXTRA_ORIGINS = 0;

export function maxOpportunitiesForOrigin(origin: string): number {
  const iata = origin.toUpperCase();
  return MAX_OPPORTUNITIES_BY_ORIGIN[iata] ?? MAX_OPPORTUNITIES_PER_ORIGIN;
}

export function isPriorityOrigin(origin: string): boolean {
  return PRIORITY_ORIGINS.includes(origin.toUpperCase());
}

/**
 * Regra do comercial: cada escopo tem suas próprias origens.
 * - NACIONAL: só o Paraná/região (MGF, LDB, CWB, CAC, IGU).
 * - INTERNACIONAL: só os hubs (GRU, GIG, BSB, CWB).
 * Ou seja: Brasília nunca aparece em voos nacionais, e Maringá/Londrina/
 * Cascavel/Foz nunca aparecem em internacionais.
 */
export function isOriginAllowedForScope(
  origin: string,
  scope: "nacional" | "internacional",
): boolean {
  const iata = origin.toUpperCase();
  const lista =
    scope === "nacional"
      ? (PRIORITY_ORIGINS_NACIONAL as readonly string[])
      : (PRIORITY_ORIGINS_HUB as readonly string[]);
  return lista.includes(iata);
}


// ---------------------------------------------------------------------------
// CURADORIA COMERCIAL — parâmetros centrais (mexer só aqui)
// ---------------------------------------------------------------------------

/**
 * Destinos que NÃO entram na curadoria nacional automática.
 * Vale apenas como DESTINO — como origem continuam liberados
 * (ex.: MGF→CWB ❌, mas CWB→REC ✅ e CWB→internacional ✅).
 */
export const NATIONAL_DESTINATION_EXCLUSIONS = new Set([
  "VCP", // Campinas
  "GRU", "CGH", "SAO", // São Paulo
  "CWB", // Curitiba
  "POA", // Porto Alegre
]);

/** Destinos nacionais de maior apelo turístico (bônus na curadoria). */
export const NATIONAL_LEISURE_DESTINATIONS = new Set([
  "GIG", "SDU", "RIO", // Rio de Janeiro
  "FLN", "CNF", "BPS", "IOS", "NVT",
  "MCZ", "REC", "SSA", "FOR", "NAT", "JPA", "AJU", "SLZ", "THE", "PHB", "MVF",
  "FEN", "JJD", "VDC", "CPV",
]);

/** Nordeste/praia — peso extra nas origens regionais (MGF, LDB, CAC, CWB, IGU). */
export const NORTHEAST_DESTINATIONS = new Set([
  "MCZ", "REC", "SSA", "FOR", "NAT", "JPA", "AJU", "SLZ", "THE", "IOS", "BPS", "JJD", "PHB", "MVF", "CPV", "VDC",
]);

/** Máximo de oportunidades do MESMO destino por origem (só com justificativa). */
export const MAX_PER_DESTINATION = 2;

/** Diferença mínima de preço (%) para justificar o 2º slot do mesmo destino. */
export const REPEAT_MIN_PRICE_GAP_PERCENT = 15;

export type PromoRegion =
  | "europa"
  | "eua"
  | "america_sul"
  | "caribe_mexico"
  | "canada"
  | "asia"
  | "oriente_medio"
  | "africa"
  | "oceania"
  | "nacional"
  | "outros";

/** Cotas PREFERENCIAIS por região (não são cotas obrigatórias). */
export const INTERNATIONAL_REGION_QUOTAS: Partial<Record<PromoRegion, number>> = {
  europa: 3,
  eua: 2,
  america_sul: 2,
  caribe_mexico: 1,
};

/** Vagas flexíveis para oportunidades realmente excepcionais de outras regiões. */
export const SPECIAL_OPPORTUNITY_SLOTS = 2;

/**
 * Preço médio de referência por mercado (R$, ida e volta). Serve só para medir
 * a excepcionalidade da tarifa — nunca é publicado.
 */
export const REGION_BASELINE_PRICE: Record<PromoRegion, number> = {
  europa: 4200,
  eua: 3800,
  america_sul: 2200,
  caribe_mexico: 3400,
  canada: 4800,
  asia: 6000,
  oriente_medio: 5200,
  africa: 6500,
  oceania: 9500,
  nacional: 1200,
  outros: 4000,
};

/**
 * Uma oportunidade de região sem cota (Ásia, África, Canadá, Oriente Médio,
 * Oceania) só ocupa vaga especial quando o preço estiver bem abaixo do
 * padrão daquele mercado.
 */
export const SPECIAL_OPPORTUNITY_MAX_RATIO = 0.72;

/** Mapa IATA → região (o que não estiver aqui cai em `outros`). */
export const REGION_BY_IATA: Record<string, PromoRegion> = {
  // Europa
  LIS: "europa", OPO: "europa", MAD: "europa", BCN: "europa", AGP: "europa", VLC: "europa",
  CDG: "europa", ORY: "europa", LHR: "europa", LGW: "europa", STN: "europa", DUB: "europa",
  FCO: "europa", MXP: "europa", VCE: "europa", NAP: "europa", ATH: "europa", AMS: "europa",
  BRU: "europa", FRA: "europa", MUC: "europa", BER: "europa", ZRH: "europa", GVA: "europa",
  VIE: "europa", PRG: "europa", BUD: "europa", WAW: "europa", CPH: "europa", ARN: "europa",
  OSL: "europa", HEL: "europa", IST: "europa", EDI: "europa", MAN: "europa", TLS: "europa",
  // EUA
  MIA: "eua", MCO: "eua", FLL: "eua", JFK: "eua", EWR: "eua", LGA: "eua", NYC: "eua",
  LAX: "eua", SFO: "eua", LAS: "eua", ORD: "eua", ATL: "eua", IAD: "eua", DFW: "eua",
  BOS: "eua", IAH: "eua", TPA: "eua", SEA: "eua", DEN: "eua", PHX: "eua", HNL: "eua",
  // América do Sul
  EZE: "america_sul", AEP: "america_sul", SCL: "america_sul", MVD: "america_sul",
  ASU: "america_sul", LIM: "america_sul", BOG: "america_sul", CTG: "america_sul",
  MDE: "america_sul", UIO: "america_sul", GYE: "america_sul", CCS: "america_sul",
  VVI: "america_sul", LPB: "america_sul", CUZ: "america_sul", PDP: "america_sul",
  IQQ: "america_sul", ANF: "america_sul", GEO: "america_sul", PBM: "america_sul",
  // Caribe / México
  CUN: "caribe_mexico", MEX: "caribe_mexico", PUJ: "caribe_mexico", SDQ: "caribe_mexico",
  AUA: "caribe_mexico", CUR: "caribe_mexico", MBJ: "caribe_mexico", NAS: "caribe_mexico",
  SJU: "caribe_mexico", HAV: "caribe_mexico", GCM: "caribe_mexico", BGI: "caribe_mexico",
  SJO: "caribe_mexico", PTY: "caribe_mexico", GDL: "caribe_mexico", SJD: "caribe_mexico",
  // Canadá
  YYZ: "canada", YUL: "canada", YVR: "canada", YOW: "canada", YYC: "canada",
  // Ásia
  NRT: "asia", HND: "asia", ICN: "asia", PEK: "asia", PVG: "asia", HKG: "asia",
  BKK: "asia", SIN: "asia", KUL: "asia", DEL: "asia", BOM: "asia", DPS: "asia", TPE: "asia",
  // Oriente Médio
  DXB: "oriente_medio", AUH: "oriente_medio", DOH: "oriente_medio", TLV: "oriente_medio",
  RUH: "oriente_medio", JED: "oriente_medio", AMM: "oriente_medio", CAI: "oriente_medio",
  // África
  JNB: "africa", CPT: "africa", NBO: "africa", ADD: "africa", CMN: "africa",
  RAK: "africa", LAD: "africa", MPM: "africa", SEZ: "africa", MRU: "africa", DKR: "africa",
  // Oceania
  SYD: "oceania", MEL: "oceania", BNE: "oceania", AKL: "oceania", PER: "oceania",
};

export function regionOfDestination(iata: string, scope: "nacional" | "internacional"): PromoRegion {
  if (scope === "nacional") return "nacional";
  return REGION_BY_IATA[iata.toUpperCase()] ?? "outros";
}

/** Regiões com cota preferencial (as demais disputam as vagas especiais). */
export function hasRegionQuota(region: PromoRegion): boolean {
  return INTERNATIONAL_REGION_QUOTAS[region] != null;
}

/** O destino pode entrar na curadoria NACIONAL? */
export function isDestinationAllowedNacional(iata: string): boolean {
  return !NATIONAL_DESTINATION_EXCLUSIONS.has(iata.trim().toUpperCase());
}

/** Métricas por origem registradas em cada ciclo. */
export type OriginMetrics = {
  origin: string;
  discovered: number;
  deduped: number;
  /** elegíveis após blacklist/regras de curadoria */
  eligible?: number;
  /** descartados pelas exclusões/regras */
  excluded?: number;
  selected: number;
  validated: number;
  with_price: number;
  no_result: number;
  errors: number;
  avg_seconds: number | null;
};

