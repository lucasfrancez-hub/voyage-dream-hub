import { z } from "zod";

/** Produto capturado pelo robô da extensão no portal da operadora. */
export const catalogProductInputSchema = z.object({
  external_code: z.string().min(1).max(200),
  internal_code: z.string().max(200).optional(),
  name: z.string().min(1).max(500),
  subtitle: z.string().max(500).optional(),
  description: z.string().max(20000).optional(),
  summary: z.string().max(4000).optional(),
  highlights: z.array(z.string().max(1000)).max(100).optional(),
  service_type: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  subcategory: z.string().max(200).optional(),
  duration: z.string().max(200).optional(),
  language: z.string().max(200).optional(),
  schedules: z.array(z.string().max(500)).max(200).optional(),
  available_days: z.array(z.string().max(100)).max(50).optional(),
  departure_place: z.string().max(1000).optional(),
  return_place: z.string().max(1000).optional(),
  meeting_point: z.string().max(1000).optional(),
  cancellation_policy: z.string().max(10000).optional(),
  change_policy: z.string().max(10000).optional(),
  important_info: z.string().max(20000).optional(),
  notes: z.string().max(10000).optional(),
  requirements: z.string().max(10000).optional(),
  includes: z.array(z.string().max(1000)).max(200).optional(),
  not_includes: z.array(z.string().max(1000)).max(200).optional(),
  supplier: z.string().max(300).optional(),
  currency: z.string().max(10).optional(),
  price: z.number().nonnegative().optional(),
  destination: z.string().max(300).optional(),
  city: z.string().max(200).optional(),
  state: z.string().max(200).optional(),
  country: z.string().max(200).optional(),
  product_url: z.string().max(2000).optional(),
  images: z.array(z.string().max(2000)).max(120).optional(),
  /** Período pesquisado que originou esse resultado. */
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  available: z.boolean().optional(),
  rates: z
    .array(
      z.object({
        label: z.string().max(300).optional(),
        currency: z.string().max(10).optional(),
        amount: z.number().optional(),
        rate_type: z.string().max(100).optional(),
      }),
    )
    .max(60)
    .optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type CatalogProductInput = z.infer<typeof catalogProductInputSchema>;

export const catalogIngestSchema = z.object({
  token: z.string().min(20).max(200),
  action: z.enum(["ingest", "progress", "finish"]).default("ingest"),
  products: z.array(catalogProductInputSchema).max(50).optional(),
  progress: z
    .object({
      operator: z.string().max(200).optional(),
      destination: z.string().max(200).optional(),
      period: z.string().max(100).optional(),
      page: z.number().int().optional(),
      total_pages: z.number().int().optional(),
      product: z.string().max(500).optional(),
      done_periods: z.number().int().optional(),
      total_periods: z.number().int().optional(),
      message: z.string().max(1000).optional(),
    })
    .optional(),
  errors: z
    .array(z.object({ message: z.string().max(2000), context: z.record(z.string(), z.unknown()).optional() }))
    .max(50)
    .optional(),
  /** Códigos vistos na varredura completa — usado no finish pra inativar sumidos. */
  seen_codes: z.array(z.string().max(200)).max(5000).optional(),
});
export type CatalogIngestBody = z.infer<typeof catalogIngestSchema>;

/** Gera as janelas de busca (blocos de N dias, com sobreposição opcional). */
export function buildSearchPeriods(opts: {
  start?: Date;
  months?: number;
  blockDays?: number;
  overlapDays?: number;
}): { start: string; end: string }[] {
  const start = opts.start ? new Date(opts.start) : new Date();
  const months = opts.months ?? 12;
  const blockDays = Math.max(1, opts.blockDays ?? 30);
  const overlap = Math.max(0, opts.overlapDays ?? 0);

  const limit = new Date(start);
  limit.setMonth(limit.getMonth() + months);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const out: { start: string; end: string }[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor < limit && guard++ < 400) {
    const end = new Date(cursor);
    end.setDate(end.getDate() + blockDays - 1);
    if (end > limit) end.setTime(limit.getTime());
    out.push({ start: iso(cursor), end: iso(end) });
    cursor.setDate(cursor.getDate() + blockDays - overlap);
  }
  return out;
}
