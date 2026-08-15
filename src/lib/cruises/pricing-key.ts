/**
 * Identidade comercial de um preço de cruzeiro (briefing 84-100).
 *
 * Regra mestre: a ocupação faz parte do preço. Mesmo cruzeiro + mesma cabine
 * + mesma tarifa com ocupação diferente é OUTRO registro comercial, nunca
 * uma captura duplicada.
 */

export type OccupancyInput = {
  adults?: number | null;
  young?: number | null;
  children?: number | null;
  infants?: number | null;
  children_ages?: number[] | null;
};

export type NormalizedOccupancy = {
  adults: number;
  young: number;
  children: number;
  infants: number;
  children_ages: number[];
  total: number;
};

export function normalizeOccupancy(o?: OccupancyInput | null): NormalizedOccupancy {
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
  };
  const adults = n(o?.adults);
  const young = n(o?.young);
  const children = n(o?.children);
  const infants = n(o?.infants);
  const ages = (o?.children_ages ?? [])
    .map((a) => Number(a))
    .filter((a) => Number.isFinite(a) && a >= 0)
    .sort((a, b) => a - b);
  return {
    adults,
    young,
    children,
    infants,
    children_ages: ages,
    total: adults + young + children + infants,
  };
}

/** Chave curta e legível da ocupação (usada como occupancy_key no banco). */
export function occupancyKey(o?: OccupancyInput | null): string {
  const occ = normalizeOccupancy(o);
  const ages = occ.children_ages.join(".");
  return `a${occ.adults}-y${occ.young}-c${occ.children}-i${occ.infants}${ages ? `-${ages}` : ""}`;
}

export function occupancyLabel(o?: OccupancyInput | null): string {
  const occ = normalizeOccupancy(o);
  const parts: string[] = [];
  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  if (occ.adults) parts.push(plural(occ.adults, "adulto", "adultos"));
  if (occ.young) parts.push(plural(occ.young, "jovem", "jovens"));
  if (occ.children) parts.push(plural(occ.children, "criança", "crianças"));
  if (occ.infants) parts.push(plural(occ.infants, "bebê", "bebês"));
  return parts.join(" + ") || "ocupação não informada";
}

function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  let h2 = 52711;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    h2 = ((h2 << 5) + h2 + input.charCodeAt(i)) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export type PricingFingerprintInput = {
  cruiseId: string;
  departureDate?: string | null;
  cabinType?: string | null;
  cabinCategoryCodes?: string[] | null;
  fareName?: string | null;
  occupancy?: OccupancyInput | null;
};

/**
 * 97. Fingerprint comercial: só colide quando cruzeiro + data + tipo/categoria
 * + tarifa + composição de passageiros forem exatamente os mesmos.
 */
export function buildPricingFingerprint(data: PricingFingerprintInput): string {
  const occ = normalizeOccupancy(data.occupancy);
  const canonical = JSON.stringify({
    cruiseId: String(data.cruiseId || "").trim(),
    departureDate: String(data.departureDate || "").slice(0, 10),
    cabinType: String(data.cabinType || "").trim().toLowerCase(),
    cabinCategoryCodes: [...(data.cabinCategoryCodes ?? [])]
      .map((c) => String(c).trim())
      .filter(Boolean)
      .sort(),
    fareName: String(data.fareName || "").trim().toLowerCase(),
    occupancy: {
      adults: occ.adults,
      young: occ.young,
      children: occ.children,
      infants: occ.infants,
      children_ages: occ.children_ages,
    },
  });
  return djb2(canonical);
}

/**
 * 90. Média calculada — nunca confundir com o preço individual informado
 * pela operadora (source_passenger_price).
 */
export function calculatedAveragePerPerson(
  total: number | null | undefined,
  occupancy?: OccupancyInput | null,
): number | null {
  const occ = normalizeOccupancy(occupancy);
  if (total === null || total === undefined || !Number.isFinite(Number(total))) return null;
  if (!occ.total) return null;
  return Math.round((Number(total) / occ.total) * 100) / 100;
}
