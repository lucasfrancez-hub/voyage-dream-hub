ALTER TABLE public.airfare_promo_runs
  ADD COLUMN IF NOT EXISTS validation_metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS airfare_promo_candidates_fila_idx
  ON public.airfare_promo_candidates (run_id, status, priority, created_at);