ALTER TABLE public.airfare_promo_candidates
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS motor_ms integer,
  ADD COLUMN IF NOT EXISTS timeout_ms integer,
  ADD COLUMN IF NOT EXISTS outcome_kind text;

CREATE INDEX IF NOT EXISTS airfare_promo_candidates_run_outcome_idx
  ON public.airfare_promo_candidates (run_id, outcome_kind);