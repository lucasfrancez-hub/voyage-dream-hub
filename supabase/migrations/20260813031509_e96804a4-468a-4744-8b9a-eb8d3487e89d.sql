ALTER TABLE public.airfare_promo_runs
  ADD COLUMN IF NOT EXISTS radar_available boolean,
  ADD COLUMN IF NOT EXISTS radar_errors integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fallback_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS radar_note text;