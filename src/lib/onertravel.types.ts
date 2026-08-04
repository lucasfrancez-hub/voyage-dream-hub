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
    baggagesAllowance?: Array<{
      typeDescription?: string;
      quantity?: number;
      weight?: number;
      unitDescription?: string;
    }>;
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

export function flightSignature(f: OnerFlight): string {
  const segments = (f.journey?.segments ?? [])
    .map((segment) =>
      `${segment.flightNumber}|${placeSignature(segment.departure)}|${placeSignature(segment.destination)}`,
    )
    .join("~");
  const bags = (f.journey?.baggagesAllowance ?? [])
    .map((bag) => `${bag.typeDescription ?? ""}${bag.quantity ?? ""}${bag.weight ?? ""}`)
    .sort()
    .join(",");
  return [
    f.journey?.marketingAirline?.iata ?? "",
    segments || `${placeSignature(f.journey?.departure)}>${placeSignature(f.journey?.destination)}`,
    f.journey?.allowedBaggage ? "BAG" : "NOBAG",
    bags,
    f.price?.passengerCount ?? "",
  ].join("#");
}