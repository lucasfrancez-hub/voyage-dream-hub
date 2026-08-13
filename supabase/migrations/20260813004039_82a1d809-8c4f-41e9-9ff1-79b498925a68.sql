ALTER TABLE public.airfare_promo_runs
  ADD COLUMN IF NOT EXISTS origin_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deduped integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovered_raw integer NOT NULL DEFAULT 0;