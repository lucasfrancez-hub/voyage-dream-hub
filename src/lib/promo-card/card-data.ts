/**
 * Objeto ÚNICO de dados que alimenta os dois cards aprovados
 * (Feed 4:5 e Story 9:16). Feed e Story nunca têm dados diferentes.
 */

export type PromoCardFormat = "feed" | "story";

export type PromoCardData = {
  /** Fotografia real do destino (URL absoluta). */
  destinationImage: string | null;
  /** Enquadramento do object-fit: cover (ex.: "50% 40%"). */
  imagePosition?: string;

  categoria: string;
  /** Texto grande. Ex.: "MADRI" */
  destination: string;
  origin: string;
  destinationCity: string;
  originIata: string;
  destinationIata: string;
  tripType: "ida-e-volta" | "somente-ida";

  statusLabel: string;
  validityLabel: string;

  departureDate: string; // dd/mm/aaaa
  returnDate: string | null;

  airline: string;
  airlineIata: string | null;
  airlineLogo: string | null;

  baggage: string;

  totalPrice: number;
  interestFreeInstallments: number;
  interestFreeInstallmentValue: number;
  extendedInstallments: number | null;
  extendedInstallmentValue: number | null;
  /** true quando a companhia não parcela — o bloco vira "à vista / Pix". */
  pixOnly: boolean;

  checkoutUrl?: string | null;
};

const MESES_ISO = (iso?: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function bagagemLabel(row: {
  has_checked_baggage?: boolean | null;
  baggage_label?: string | null;
}): string {
  if (row.baggage_label) return row.baggage_label;
  return row.has_checked_baggage
    ? "Item pessoal + bagagem de mão + 1 mala despachada"
    : "Item pessoal + bagagem de mão";
}

/** Monta o objeto do card a partir de uma linha de `airfare_promotions`. */
export function promoToCardData(row: Record<string, unknown>): PromoCardData {
  const roundTrip = Boolean(row.is_round_trip) && Boolean(row.return_date);
  const destCity = String(row.destination_city ?? row.destination_iata ?? "");
  const semJuros = Math.max(1, Number(row.interest_free_installments ?? 1));
  const extN = row.extended_max_installments ? Number(row.extended_max_installments) : null;
  const extV = row.extended_installment_value_12x ? num(row.extended_installment_value_12x) : null;

  return {
    destinationImage: (row.destination_image as string | null) ?? null,
    imagePosition: "50% 45%",
    categoria: "Passagens aéreas",
    destination: destCity.toUpperCase(),
    origin: String(row.origin_city ?? row.origin_iata ?? ""),
    destinationCity: destCity,
    originIata: String(row.origin_iata ?? ""),
    destinationIata: String(row.destination_iata ?? ""),
    tripType: roundTrip ? "ida-e-volta" : "somente-ida",
    statusLabel: "Tarifa encontrada agora",
    validityLabel: "Valor válido para compra hoje • sujeito à disponibilidade e atualização tarifária",
    departureDate: MESES_ISO(row.departure_date as string) ?? "",
    returnDate: roundTrip ? MESES_ISO(row.return_date as string) : null,
    airline: String(row.airline_name ?? row.airline_iata ?? ""),
    airlineIata: (row.airline_iata as string | null) ?? null,
    airlineLogo: (row.airline_logo as string | null) ?? null,
    baggage: bagagemLabel(row as never),
    totalPrice: num(row.total_price),
    interestFreeInstallments: semJuros,
    interestFreeInstallmentValue: num(row.interest_free_installment_value) || num(row.total_price) / semJuros,
    extendedInstallments: extN,
    extendedInstallmentValue: extV,
    pixOnly: semJuros <= 1 && !extN,
    checkoutUrl: (row.short_url as string | null) ?? (row.cart_url as string | null) ?? null,
  };
}
