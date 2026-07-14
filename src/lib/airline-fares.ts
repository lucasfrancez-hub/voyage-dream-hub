// Cabin classes (fixed) and airline-specific fare brand names.
// fare_class = commercial brand of the ticket (Light, Basic, Full, Business…).

export const CABIN_CLASSES = [
  "Econômica",
  "Premium Economy",
  "Executiva",
  "Primeira Classe",
] as const;

export type CabinClass = (typeof CABIN_CLASSES)[number];

/**
 * Fare brands per airline (IATA code). When empty/unknown, we fall back to
 * GENERIC_FARE_CLASSES. Keep names as they appear on the tarifario público
 * de cada cia — o agente reconhece de bate-pronto.
 */
export const FARE_CLASSES_BY_AIRLINE: Record<string, string[]> = {
  // ── Brasil ──
  LA: ["Basic", "Light", "Plus", "Top", "Premium Economy", "Premium Business"],
  G3: ["Light", "Max", "Full", "Comfort", "Premium Business"],
  AD: ["Descontrole (Promo)", "Mais Azul", "Azul Basic", "Azul Full", "Business"],

  // ── Américas ──
  AA: ["Basic Economy", "Main Cabin", "Main Cabin Extra", "Premium Economy", "Business", "Flagship First"],
  DL: ["Basic Economy", "Main Cabin", "Delta Comfort+", "Premium Select", "Delta One"],
  UA: ["Basic Economy", "Economy", "Economy Plus", "Premium Plus", "Business", "Polaris Business"],
  AC: ["Basic", "Standard", "Flex", "Comfort", "Latitude", "Premium Economy", "Business", "Signature Class"],
  AM: ["Basic", "Classic", "AM Plus", "Premier"],
  CM: ["Economy Basic", "Economy Classic", "Economy Full", "Business"],
  AV: ["Basic", "Classic", "Flex", "Business"],
  AR: ["Promo", "Clásica", "Flex", "Club Economy", "Club Cóndor"],
  OB: ["Promo", "Turista", "Ejecutiva"],
  DM: ["Simple", "Extra", "Super", "Business"],
  JA: ["JetSmart Zero", "JetSmart Basic", "JetSmart Full", "JetSmart Plus"],
  H2: ["Zero", "Light", "Full", "Plus"],

  // ── Europa ──
  AF: ["Light", "Standard", "Flex", "Premium Economy", "Business", "La Première"],
  KL: ["Light", "Standard", "Flex", "Premium Comfort", "Business"],
  LH: ["Economy Light", "Economy Classic", "Economy Flex", "Premium Economy", "Business", "First"],
  LX: ["Economy Light", "Economy Classic", "Economy Flex", "Business", "First"],
  IB: ["Basic", "Classic", "Flexible", "Premium Economy", "Business Plus"],
  BA: ["Basic", "Standard", "Plus Flex", "World Traveller Plus", "Club World", "First"],
  TP: ["Discount", "Basic", "Classic", "Plus", "Executive"],
  AZ: ["Light", "Standard", "Flex", "Premium Economy", "Business"],
  UX: ["Light", "Standard", "Flex", "Business"],
  TK: ["Eco Fly", "Extra Fly", "Prime Fly", "Business"],
  LY: ["Lite", "Classic", "Flex", "Premium", "Business", "First"],
  HR: ["Basic", "Standard", "Business"],
  GP: ["Standard"],

  // ── África / Oriente Médio ──
  EK: ["Special", "Saver", "Flex", "Flex Plus", "Premium Economy", "Business", "First"],
  QR: ["Convenience", "Comfort", "Elite", "Business Classic", "Business Elite", "First"],
  ET: ["Blue", "Silver", "Gold", "Cloud Nine (Business)"],
  SA: ["Discount", "Standard", "Flex", "Business"],
  AT: ["Light", "Standard", "Flex", "Business"],
  DT: ["Light", "Standard", "Business"],

  // ── Ásia / Oceania ──
  SQ: ["Lite", "Standard", "Flexi", "Premium Economy", "Business", "First", "Suites"],
  CX: ["Economy Light", "Economy Essential", "Economy Flex", "Premium Economy", "Business", "First"],
  JL: ["Economy", "Premium Economy", "Business", "First"],
  NH: ["Economy Basic", "Economy Standard", "Economy Flex", "Premium Economy", "Business", "First"],
  KE: ["Economy Saver", "Economy Standard", "Economy Flex", "Prestige (Business)", "First"],
  CA: ["Economy", "Premium Economy", "Business", "First"],
  MF: ["Economy", "Business", "First"],
  NZ: ["Seat", "Seat + Bag", "Flexi", "Premium Economy", "Business Premier"],
  QF: ["Sale", "Saver", "Flex", "Premium Economy", "Business", "First"],
};

/** Marcas genéricas para companhias fora do registro. */
export const GENERIC_FARE_CLASSES = [
  "Promo",
  "Light",
  "Basic",
  "Standard",
  "Full",
  "Flex",
  "Premium Economy",
  "Business",
  "First",
];

/** Retorna a lista de tarifas para um IATA; cai no genérico se não achar. */
export function fareClassesFor(iata: string | null | undefined): string[] {
  if (!iata) return GENERIC_FARE_CLASSES;
  return FARE_CLASSES_BY_AIRLINE[iata.toUpperCase()] ?? GENERIC_FARE_CLASSES;
}
