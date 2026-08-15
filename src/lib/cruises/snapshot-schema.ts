/**
 * Contrato do snapshot enviado pelo plugin "Exportar Cruzeiro".
 * Cliente-safe (usado pelo endpoint público e pela UI admin).
 */
import { z } from "zod";

export const cabinTypeEnum = z.enum(["interna", "externa", "varanda", "suite", "outro"]);

const num = z.union([z.number(), z.string()]).nullish().transform((v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
});

const str = z.union([z.string(), z.number()]).nullish().transform((v) =>
  v === null || v === undefined ? "" : String(v).trim(),
);

export const occupancySchema = z.object({
  adults: z.number().int().min(0).default(0),
  young: z.number().int().min(0).default(0),
  children: z.number().int().min(0).default(0),
  infants: z.number().int().min(0).default(0),
  children_ages: z.array(z.number().int().min(0).max(30)).default([]),
});
export type Occupancy = z.infer<typeof occupancySchema>;

export const priceSchema = z.object({
  base_amount: num,
  taxes: num,
  total: num,
  currency: str.default("BRL"),
  installments: z.record(z.string(), z.unknown()).default({}),
  passenger_prices: z.array(z.record(z.string(), z.unknown())).default([]),
  occupancy: occupancySchema.optional(),
  /** de onde a ocupação foi lida na página (dom_modal, dom_button, price_rows…) */
  occupancy_source: str.default(""),
  /** 94/96. Divergências entre ocupação pedida e renderizada, etc. */
  occupancy_warnings: z.array(z.string()).default([]),
});


export const cabinOfferSchema = z.object({
  cabin_type: cabinTypeEnum.default("outro"),
  name: z.string().min(1),
  fare_name: str.default(""),
  category_codes: z.array(z.string()).default([]),
  image_url: str.default(""),
  amenities: z.array(z.string()).default([]),
  availability: str.default(""),
  price: priceSchema.optional(),
});

export const snapshotDataSchema = z.object({
  cruise: z
    .object({
      name: str.default(""),
      ship_name: str.default(""),
      line: str.default(""),
      departure_date: str.default(""),
      return_date: str.default(""),
      nights: z.number().int().nullish(),
      embark_port: str.default(""),
      disembark_port: str.default(""),
      currency: str.default("BRL"),
    })
    .partial()
    .optional(),
  occupancy: occupancySchema.optional(),
  ship: z
    .object({
      name: str.default(""),
      line: str.default(""),
      description: str.default(""),
      main_image_url: str.default(""),
      technical_image_url: str.default(""),
      specs: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
    })
    .partial()
    .optional(),
  itinerary: z
    .array(
      z.object({
        day: z.number().int().min(1),
        date: str.default(""),
        port: str.default(""),
        country: str.default(""),
        arrival: str.default(""),
        departure: str.default(""),
        description: str.default(""),
        image_url: str.default(""),
        map_image_url: str.default(""),
        activities: z.array(z.record(z.string(), z.unknown())).default([]),
      }),
    )
    .default([]),
  cabin_offers: z.array(cabinOfferSchema).default([]),
  ship_cabins: z
    .array(
      z.object({
        cabin_type: cabinTypeEnum.default("outro"),
        code: str.default(""),
        name: z.string().min(1),
        capacity: z.number().int().nullish(),
        size_m2: str.default(""),
        description: str.default(""),
        amenities: z.array(z.string()).default([]),
        photos: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  attractions: z
    .array(
      z.object({
        category: str.default("outros"),
        name: z.string().min(1),
        description: str.default(""),
        deck: str.default(""),
        images: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  decks: z
    .array(
      z.object({
        deck_label: z.string().min(1),
        deck_number: z.number().int().nullish(),
        image_url: str.default(""),
        source_url: str.default(""),
      }),
    )
    .default([]),
  media: z
    .array(
      z.object({
        media_type: z.enum(["image", "video"]).default("image"),
        context: str.default("gallery"),
        source_url: z.string().min(4),
        hires_url: str.default(""),
        thumbnail_url: str.default(""),
        embed_url: str.default(""),
        provider: str.default(""),
        title: str.default(""),
        alt: str.default(""),
        scope: z.enum(["ship", "cruise"]).default("cruise"),
      }),
    )
    .default([]),
  additionals: z
    .array(
      z.object({
        category: str.default("Outros"),
        code: str.default(""),
        name: z.string().min(1),
        description: str.default(""),
        prices: z.record(z.string(), num).default({}),
      }),
    )
    .default([]),
  insurances: z
    .array(
      z.object({
        name: z.string().min(1),
        price_per_person: num,
        coverage_url: str.default(""),
      }),
    )
    .default([]),
});
export type SnapshotData = z.infer<typeof snapshotDataSchema>;

export const snapshotPayloadSchema = z.object({
  source: z.string().max(40).default("FRT_KROOZE"),
  /** 76. Versionamento do parser — permite reprocessar snapshots antigos. */
  parser_name: z.string().max(60).default("FRTKroozeCruiseParser"),
  parser_version: z.string().max(20).default("1.0.0"),
  url: z.string().max(2000).default(""),
  page_type: z.string().max(60).default("desconhecido"),
  detected: z.array(z.string()).default([]),
  captured_at: z.string().max(40).optional(),
  /** 75. Avisos do parser — captura parcial nunca falha por inteiro. */
  warnings: z.array(z.string()).default([]),
  /** 74. Log técnico por campo (selector usado + confiança). */
  field_logs: z
    .array(
      z.object({
        field: z.string(),
        selector_used: z.string().nullish(),
        value: z.unknown().optional(),
        confidence: z.number().min(0).max(1).default(1),
      }),
    )
    .default([]),
  data: snapshotDataSchema.default({} as SnapshotData),
  /** HTML/XHR bruto — nunca é destruído, permite reprocessar. */
  raw: z.record(z.string(), z.unknown()).default({}),
});
export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;
