export type OnerPlace = {
  iata: string;
  name: string;
  city: string;
  date: { year: number; month: number; day: number };
  time: { hour: number; minute: number };
};

export type OnerSegment = {
  segmentNumber: number;
  flightNumber: string;
  cabinClass?: string;
  airlineFareFamily?: string;
  departure: OnerPlace;
  destination: OnerPlace;
  marketingAirline?: { iata?: string; name?: string; pathLogo?: string };
};

export type OnerBaggage = {
  typeDescription?: string;
  quantity?: number;
  weight?: number;
  unitDescription?: string;
};

/** Família tarifária (LIGHT / CLASSIC / FLEX...) do MESMO itinerário. */
export type OnerFareOption = {
  key: string;
  total: number;
  price: number;
  tax: number;
  cabinClass?: string | null;
  fareFamily?: string | null;
  allowedBaggage?: boolean;
  baggagesAllowance?: OnerBaggage[];
};

export type OnerFlight = {
  key: string;
  price: {
    price: number;
    tax: number;
    serviceTax?: number;
    total: number;
    passengerCount: number;
  };
  journey: {
    key?: string;
    flyingTime: { hour: number; minute: number };
    numberOfStops: number;
    fareClass?: { cabinClass?: string; airlineFareFamily?: string };
    allowedBaggage?: boolean;
    baggagesAllowance?: OnerBaggage[];
    departure: OnerPlace;
    destination: OnerPlace;
    marketingAirline?: { iata?: string; name?: string; pathLogo?: string };
    segments: OnerSegment[];
  };
  /**
   * Outras tarifas (fornecedores) para exatamente o mesmo voo, da mais barata
   * para a mais cara. A operadora combina ida+volta por tarifa: se a tarifa
   * escolhida não tem volta combinável, tentamos a próxima daqui.
   */
  altKeys?: string[];
  /** Preço de cada tarifa alternativa, na mesma ordem de altKeys. */
  altTotals?: number[];
  /** Famílias tarifárias do mesmo itinerário, da mais barata para a mais cara. */
  fareOptions?: OnerFareOption[];
};


export type OnerLegResult = {
  totalFlightsCount: number;
  flights: OnerFlight[];
  priceRange?: { minPrice: number; maxPrice: number } | null;
};

export type OnerSearchResult = {
  searchKey: string;
  outbound: OnerLegResult;
  inbound?: OnerLegResult | null;
};

export function flightHasBaggage(f: OnerFlight): boolean {
  if (f.journey.allowedBaggage) return true;
  return (f.journey.baggagesAllowance ?? []).some((b) => {
    const description = `${b.typeDescription ?? ""}`.toLowerCase();
    const isChecked =
      description.includes("dispatch") || description.includes("despach") || description.includes("checked");
    return isChecked && (b.quantity ?? 0) > 0;
  });
}

function placeSignature(place?: OnerPlace): string {
  if (!place) return "";
  return `${place.iata}${place.date?.year}-${place.date?.month}-${place.date?.day}T${place.time?.hour}:${place.time?.minute}`;
}

/**
 * Assinatura do ITINERÁRIO (companhia + voos + horários + pax). Não inclui
 * bagagem/tarifa de propósito: as famílias tarifárias (LIGHT, CLASSIC, FLEX)
 * do mesmo voo precisam cair no mesmo grupo para virarem opções de tarifa.
 */
export function flightSignature(f: OnerFlight): string {
  const segments = (f.journey?.segments ?? [])
    .map((segment) =>
      `${segment.flightNumber}|${placeSignature(segment.departure)}|${placeSignature(segment.destination)}`,
    )
    .join("~");
  return [
    f.journey?.marketingAirline?.iata ?? "",
    segments || `${placeSignature(f.journey?.departure)}>${placeSignature(f.journey?.destination)}`,
    f.price?.passengerCount ?? "",
  ].join("#");
}

/** Bagagem despachada declarada em uma família tarifária. */
export function fareHasBaggage(o: OnerFareOption): boolean {
  if (o.allowedBaggage) return true;
  return (o.baggagesAllowance ?? []).some((b) => {
    const description = `${b.typeDescription ?? ""}`.toLowerCase();
    const isChecked =
      description.includes("dispatch") || description.includes("despach") || description.includes("checked");
    return isChecked && (b.quantity ?? 0) > 0;
  });
}

/** Peça(s) de bagagem despachada descritas na tarifa. */
export function fareCheckedText(o: OnerFareOption): string {
  const bag = (o.baggagesAllowance ?? []).find((b) => {
    const d = `${b.typeDescription ?? ""}`.toLowerCase();
    return d.includes("dispatch") || d.includes("despach") || d.includes("checked");
  });
  if (!fareHasBaggage(o)) return "0 peça de bagagem despachada";
  const qty = bag?.quantity ?? 1;
  const weight = bag?.weight ?? 23;
  return `${qty} peça(s) de ${weight}kg de bagagem despachada`;
}

/** Bagagem de mão declarada na tarifa (padrão 10kg). */
export function fareCarryOnText(o: OnerFareOption): string {
  const bag = (o.baggagesAllowance ?? []).find((b) => {
    const d = `${b.typeDescription ?? ""}`.toLowerCase();
    return d.includes("hand") || d.includes("mão") || d.includes("mao") || d.includes("carry");
  });
  const weight = bag?.weight ?? 10;
  return `${weight}kg de bagagem de mão`;
}

const CABIN_LABELS: Array<{ id: string; label: string; match: string[] }> = [
  { id: "PREMIUM_ECONOMY", label: "Econômica premium", match: ["premium"] },
  { id: "BUSINESS", label: "Executiva", match: ["business", "executiv"] },
  { id: "FIRST", label: "Primeira classe", match: ["first", "primeira"] },
  { id: "ECONOMY", label: "Econômica", match: ["economy", "econ"] },
];

export const CABIN_OPTIONS = [
  { id: "ECONOMY", label: "Econômica" },
  { id: "PREMIUM_ECONOMY", label: "Econômica premium" },
  { id: "BUSINESS", label: "Executiva" },
  { id: "FIRST", label: "Primeira classe" },
];

/** Normaliza o texto de classe da operadora para um dos ids de CABIN_OPTIONS. */
export function cabinIdOf(raw?: string | null): string | null {
  const v = `${raw ?? ""}`.toLowerCase();
  if (!v) return null;
  for (const c of CABIN_LABELS) if (c.match.some((m) => v.includes(m))) return c.id;
  return null;
}

export function cabinLabelOf(id?: string | null): string {
  return CABIN_OPTIONS.find((c) => c.id === id)?.label ?? "Classe Econômica";
}

/** Classe do voo (primeiro segmento com informação). */
export function flightCabinId(f: OnerFlight): string | null {
  return (
    cabinIdOf(f.journey?.fareClass?.cabinClass) ??
    cabinIdOf(f.journey?.segments?.find((s) => s.cabinClass)?.cabinClass) ??
    null
  );
}

/** Aplica uma família tarifária ao voo, devolvendo o voo com preço/bagagem corretos. */
export function applyFareOption(f: OnerFlight, key: string): OnerFlight {
  const o = f.fareOptions?.find((x) => x.key === key);
  if (!o) return f;
  return {
    ...f,
    key: o.key,
    price: { ...f.price, price: o.price, tax: o.tax, total: o.total },
    journey: {
      ...f.journey,
      allowedBaggage: o.allowedBaggage,
      baggagesAllowance: o.baggagesAllowance,
      fareClass: {
        cabinClass: o.cabinClass ?? f.journey.fareClass?.cabinClass,
        airlineFareFamily: o.fareFamily ?? f.journey.fareClass?.airlineFareFamily,
      },
    },
  };
}
