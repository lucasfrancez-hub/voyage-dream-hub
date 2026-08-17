ALTER TABLE public.airfare_promo_runs
  ADD COLUMN IF NOT EXISTS discovery_state jsonb,
  ADD COLUMN IF NOT EXISTS discovery_origins_done integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovery_origins_total integer NOT NULL DEFAULT 0;