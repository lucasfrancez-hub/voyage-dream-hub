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