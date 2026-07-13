ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS tripadvisor_location_id text,
  ADD COLUMN IF NOT EXISTS tripadvisor_url text,
  ADD COLUMN IF NOT EXISTS tripadvisor_address text,
  ADD COLUMN IF NOT EXISTS tripadvisor_photos jsonb;