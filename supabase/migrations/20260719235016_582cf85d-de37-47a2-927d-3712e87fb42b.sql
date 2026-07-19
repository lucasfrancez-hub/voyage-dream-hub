
ALTER TABLE public.flight_checkins
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'code',
  ADD COLUMN IF NOT EXISTS run_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS vision_cost_cents INTEGER;

ALTER TABLE public.flight_checkins
  DROP CONSTRAINT IF EXISTS flight_checkins_mode_check;
ALTER TABLE public.flight_checkins
  ADD CONSTRAINT flight_checkins_mode_check CHECK (mode IN ('code','vision'));
