ALTER TABLE public.airfare_promotions
  ADD COLUMN IF NOT EXISTS cycle_state text NOT NULL DEFAULT 'unchanged',
  ADD COLUMN IF NOT EXISTS cycle_changed_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cycle_state_at timestamptz,
  ADD COLUMN IF NOT EXISTS cycle_day date;

ALTER TABLE public.airfare_promotions
  DROP CONSTRAINT IF EXISTS airfare_promotions_cycle_state_check;
ALTER TABLE public.airfare_promotions
  ADD CONSTRAINT airfare_promotions_cycle_state_check
  CHECK (cycle_state IN ('new','changed','unchanged'));

CREATE INDEX IF NOT EXISTS airfare_promotions_cycle_day_idx
  ON public.airfare_promotions (cycle_day);