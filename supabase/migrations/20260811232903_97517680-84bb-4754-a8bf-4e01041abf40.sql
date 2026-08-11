ALTER TABLE public.asaas_transfers
  ADD COLUMN IF NOT EXISTS end_to_end_identifier text,
  ADD COLUMN IF NOT EXISTS refusal_reason text,
  ADD COLUMN IF NOT EXISTS confirmed_date date,
  ADD COLUMN IF NOT EXISTS asaas_status text,
  ADD COLUMN IF NOT EXISTS last_event text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_asaas_transfers_asaas_id ON public.asaas_transfers (asaas_transfer_id);
CREATE INDEX IF NOT EXISTS idx_asaas_transfer_events_transfer ON public.asaas_transfer_events (transfer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asaas_transfer_events_asaas_id ON public.asaas_transfer_events (asaas_transfer_id);