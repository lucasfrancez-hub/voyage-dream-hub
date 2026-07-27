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

export const addonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  price: z.number().nonnegative().default(0),
  price_unit: z
    .enum(["per_person", "per_cabin", "per_day", "per_person_per_day", "fixed"])
    .default("per_person"),
  category: z
    .enum([
      "bebidas",
      "wifi",
      "gorjeta",
      "transfer",
      "seguro",
      "excursao",
      "restaurante",
      "spa",
      "outro",
    ])
    .default("outro"),
  optional: z.boolean().default(true),
});
export type Addon = z.infer<typeof addonSchema>;

export const policySchema = z.object({
  payment: z.string().default(""),
  cancellation: z.string().default(""),
  boarding: z.string().default(""),
  documents: z.string().default(""),
  children_policy: z.string().default(""),
  other: z.string().default(""),
});
export type Policy = z.infer<typeof policySchema>;

export const cruiseDetailsSchema = z.object({
  cabin_categories: z.array(cabinCategorySchema).default([]),
  experiences: z.array(experienceSchema).default([]),
  addons: z.array(addonSchema).default([]),
  included: z.array(z.string()).default([]),
  not_included: z.array(z.string()).default([]),
  policies: policySchema.default({} as Policy),
  ship: shipSchema.default({} as Ship),
  itinerary: z.array(itineraryDaySchema).default([]),
  map_image: z.string().url().optional().or(z.literal("")).default(""),
  notes: z.string().default(""),
});
export type CruiseDetails = z.infer<typeof cruiseDetailsSchema>;

/**
 * Parse tolerante: valida seção a seção. Item malformado é
 * completado com defaults (id/name/port sintéticos) em vez de derrubar
 * o payload inteiro. Isso evita que o editor apareça "vazio" quando o
 * JSON tem quase tudo mas falta um campo em 1 item.
 */
export function parseCruiseDetails(raw: unknown): CruiseDetails {
  const src = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const slug = (s: string, fallback: string) =>
    (s || fallback)
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || fallback;

  const parseArr = <T,>(
    input: unknown,
    parseOne: (item: unknown, index: number) => T | null,
  ): T[] => {
    if (!Array.isArray(input)) return [];
    const out: T[] = [];
    for (let i = 0; i < input.length; i++) {
      const v = parseOne(input[i], i);
      if (v) out.push(v);
    }
    return out;
  };

  const cabin_categories = parseArr(src.cabin_categories, (item, i) => {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const name = (typeof o.name === "string" && o.name.trim()) || `Cabine ${i + 1}`;
    const withDefaults = {
      ...o,
      id: (typeof o.id === "string" && o.id.trim()) || slug(name, `cabine-${i + 1}`),
      name,
      type: cabinTypeSchema.safeParse(o.type).success ? o.type : "interna",
    };
    const r = cabinCategorySchema.safeParse(withDefaults);
    return r.success ? r.data : null;
  });

  const experiences = parseArr(src.experiences, (item, i) => {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const name = (typeof o.name === "string" && o.name.trim()) || `Experiência ${i + 1}`;
    const r = experienceSchema.safeParse({
      ...o,
      id: (typeof o.id === "string" && o.id.trim()) || slug(name, `exp-${i + 1}`),
      name,
    });
    return r.success ? r.data : null;
  });

  const addons = parseArr(src.addons, (item, i) => {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const name = (typeof o.name === "string" && o.name.trim()) || `Adicional ${i + 1}`;
    const r = addonSchema.safeParse({
      ...o,
      id: (typeof o.id === "string" && o.id.trim()) || slug(name, `addon-${i + 1}`),
      name,
    });
    return r.success ? r.data : null;
  });

  const itinerary = parseArr(src.itinerary, (item, i) => {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const port = (typeof o.port === "string" && o.port.trim()) || `Dia ${i + 1}`;
    const day = typeof o.day === "number" && o.day > 0 ? o.day : i + 1;
    const r = itineraryDaySchema.safeParse({ ...o, port, day });
    return r.success ? r.data : null;
  });

  const included = Array.isArray(src.included)
    ? src.included.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  const not_included = Array.isArray(src.not_included)
    ? src.not_included.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const shipRes = shipSchema.safeParse(src.ship ?? {});
  const ship = shipRes.success ? shipRes.data : shipSchema.parse({});

  const policiesRes = policySchema.safeParse(src.policies ?? {});
  const policies = policiesRes.success ? policiesRes.data : policySchema.parse({});

  const map_image =
    typeof src.map_image === "string" && /^https?:\/\//i.test(src.map_image) ? src.map_image : "";
  const notes = typeof src.notes === "string" ? src.notes : "";

  return {
    cabin_categories,
    experiences,
    addons,
    included,
    not_included,
    policies,
    ship,
    itinerary,
    map_image,
    notes,
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
