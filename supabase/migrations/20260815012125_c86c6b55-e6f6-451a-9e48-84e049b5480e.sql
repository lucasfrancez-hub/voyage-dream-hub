ALTER TABLE public.cruise_prices
  ADD COLUMN IF NOT EXISTS pricing_fingerprint text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS occupancy_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculated_average_per_person numeric,
  ADD COLUMN IF NOT EXISTS occupancy_source text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS cruise_prices_fingerprint_idx
  ON public.cruise_prices(pricing_fingerprint, captured_at DESC);