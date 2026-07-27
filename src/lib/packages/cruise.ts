import { z } from "zod";

/**
 * Cruise details schema — armazenado em `packages.cruise_details` (jsonb).
 * Modelado a partir do fluxo BWT/Krooze: cabines por tipo, experiências (Free at Sea),
 * navio, itinerário, galerias.
 */

export const cabinTypeSchema = z.enum(["interna", "externa", "varanda", "suite"]);
export type CabinType = z.infer<typeof cabinTypeSchema>;

export const cabinPricingTierSchema = z.object({
  per_person: z.number().nonnegative(),
  third: z.number().nonnegative().optional(),
  fourth: z.number().nonnegative().optional(),
  child: z.number().nonnegative().optional(),
});
export type CabinPricingTier = z.infer<typeof cabinPricingTierSchema>;

export const cabinPricingSchema = z.object({
  occ2: cabinPricingTierSchema.optional(),
  occ3: cabinPricingTierSchema.optional(),
  occ4: cabinPricingTierSchema.optional(),
});
export type CabinPricing = z.infer<typeof cabinPricingSchema>;

export const cabinCategorySchema = z.object({
  id: z.string().min(1),
  type: cabinTypeSchema,
  code: z.string().default(""),
  name: z.string().min(1),
  description: z.string().default(""),
  size_m2: z.string().default(""),
  capacity: z.number().int().min(1).max(8).default(2),
  photos: z.array(z.string().url()).default([]),
  category_codes: z.array(z.string()).default([]),
  pricing: cabinPricingSchema.default({}),
  taxes_total: z.number().nonnegative().default(0),
  upgrade_from_base: z.number().nonnegative().optional(),
  highlight: z.string().optional(),
});
export type CabinCategory = z.infer<typeof cabinCategorySchema>;

export const experienceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  benefits: z.array(z.string()).default([]),
  delta_per_person: z.number().default(0),
  recommended: z.boolean().default(false),
});
export type Experience = z.infer<typeof experienceSchema>;

export const shipSchema = z.object({
  name: z.string().default(""),
  line: z.string().default(""),
  gallery: z.array(z.string().url()).default([]),
  deck_plan_image: z.string().url().optional().or(z.literal("")).default(""),
  videos: z.array(z.string().url()).default([]),
  attractions: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().default(""),
        image: z.string().url().optional().or(z.literal("")).default(""),
      }),
    )
    .default([]),
  data_sheet: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .default([]),
});
export type Ship = z.infer<typeof shipSchema>;

export const itineraryDaySchema = z.object({
  day: z.number().int().min(1),
  date: z.string().default(""),
  port: z.string().min(1),
  country: z.string().default(""),
  arrival: z.string().default(""),
  departure: z.string().default(""),
  description: z.string().default(""),
  photo: z.string().url().optional().or(z.literal("")).default(""),
});
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;

export const cruiseDetailsSchema = z.object({
  cabin_categories: z.array(cabinCategorySchema).default([]),
  experiences: z.array(experienceSchema).default([]),
  ship: shipSchema.default({} as Ship),
  itinerary: z.array(itineraryDaySchema).default([]),
  map_image: z.string().url().optional().or(z.literal("")).default(""),
  notes: z.string().default(""),
});
export type CruiseDetails = z.infer<typeof cruiseDetailsSchema>;

export function parseCruiseDetails(raw: unknown): CruiseDetails {
  const res = cruiseDetailsSchema.safeParse(raw ?? {});
  if (res.success) return res.data;
  return {
    cabin_categories: [],
    experiences: [],
    ship: shipSchema.parse({}),
    itinerary: [],
    map_image: "",
    notes: "",
  };
}

export const CABIN_TYPE_LABELS: Record<CabinType, string> = {
  interna: "Interna",
  externa: "Externa",
  varanda: "Varanda",
  suite: "Suíte",
};

export function pricingForOccupancy(pricing: CabinPricing | undefined, adults: number): CabinPricingTier | undefined {
  if (!pricing) return undefined;
  if (adults <= 2) return pricing.occ2 ?? pricing.occ3 ?? pricing.occ4;
  if (adults === 3) return pricing.occ3 ?? pricing.occ2 ?? pricing.occ4;
  return pricing.occ4 ?? pricing.occ3 ?? pricing.occ2;
}

export type PricingBreakdown = {
  perPerson: number;
  third?: number;
  fourth?: number;
  childUnit?: number;
  adultsSubtotal: number;
  childrenSubtotal: number;
  taxes: number;
  experienceDelta: number;
  total: number;
  paxLabel: string;
};

export function calcCruisePrice(
  cabin: CabinCategory | undefined,
  adults: number,
  children: number,
  experience: Experience | undefined,
): PricingBreakdown | null {
  if (!cabin) return null;
  const tier = pricingForOccupancy(cabin.pricing, adults);
  if (!tier) return null;

  const p1 = tier.per_person;
  const p2 = tier.per_person;
  const p3 = tier.third ?? tier.per_person;
  const p4 = tier.fourth ?? tier.third ?? tier.per_person;
  const perAdult = [p1, p2, p3, p4];

  let adultsSubtotal = 0;
  for (let i = 0; i < Math.min(adults, 4); i++) adultsSubtotal += perAdult[i];

  const childUnit = tier.child ?? 0;
  const childrenSubtotal = childUnit * Math.max(0, children);

  const experienceDelta = (experience?.delta_per_person ?? 0) * (adults + children);
  const taxes = cabin.taxes_total ?? 0;
  const total = adultsSubtotal + childrenSubtotal + taxes + experienceDelta;

  const parts: string[] = [];
  parts.push(`${adults} adulto${adults > 1 ? "s" : ""}`);
  if (children > 0) parts.push(`${children} criança${children > 1 ? "s" : ""}`);

  return {
    perPerson: tier.per_person,
    third: tier.third,
    fourth: tier.fourth,
    childUnit: tier.child,
    adultsSubtotal,
    childrenSubtotal,
    taxes,
    experienceDelta,
    total,
    paxLabel: parts.join(" · "),
  };
}
