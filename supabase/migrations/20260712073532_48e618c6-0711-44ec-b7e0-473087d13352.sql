ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS notes_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS travel_reason_log jsonb NOT NULL DEFAULT '[]'::jsonb;