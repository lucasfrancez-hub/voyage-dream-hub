ALTER TABLE public.airfare_promo_candidates
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_token text,
  ADD COLUMN IF NOT EXISTS dead_workers integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS airfare_promo_candidates_lease_idx
  ON public.airfare_promo_candidates (run_id, status, lease_expires_at);