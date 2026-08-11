ALTER TABLE public.asaas_transfers
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_pending boolean NOT NULL DEFAULT false;

ALTER TABLE public.asaas_bill_payments
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_pending boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS asaas_transfers_dispatch_idx
  ON public.asaas_transfers (scheduled_at) WHERE dispatch_pending;
CREATE INDEX IF NOT EXISTS asaas_bill_payments_dispatch_idx
  ON public.asaas_bill_payments (scheduled_at) WHERE dispatch_pending;