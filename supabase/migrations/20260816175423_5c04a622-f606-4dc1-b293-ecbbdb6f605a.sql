ALTER TABLE public.airfare_promo_candidates
  ADD COLUMN IF NOT EXISTS radar_airline_code text,
  ADD COLUMN IF NOT EXISTS radar_airline_name text,
  ADD COLUMN IF NOT EXISTS radar_baggage text,
  ADD COLUMN IF NOT EXISTS radar_provider text,
  ADD COLUMN IF NOT EXISTS radar_external_url text;