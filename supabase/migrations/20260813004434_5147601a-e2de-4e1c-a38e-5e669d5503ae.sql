ALTER TABLE public.airfare_promo_candidates
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS airfare_promo_candidates_run_status_idx
  ON public.airfare_promo_candidates (run_id, status, priority);