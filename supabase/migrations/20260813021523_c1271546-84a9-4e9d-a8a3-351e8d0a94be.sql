ALTER TABLE public.airfare_promo_runs
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;