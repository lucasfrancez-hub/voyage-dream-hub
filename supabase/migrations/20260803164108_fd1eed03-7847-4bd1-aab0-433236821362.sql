ALTER TABLE public.wa_flight_search_requests
  ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_recovery_at timestamptz,
  ADD COLUMN IF NOT EXISTS transferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_reason text,
  ADD COLUMN IF NOT EXISTS transfer_briefing text;