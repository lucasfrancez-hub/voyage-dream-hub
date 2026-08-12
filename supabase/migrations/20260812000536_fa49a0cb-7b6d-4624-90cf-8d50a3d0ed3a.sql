ALTER TABLE public.asaas_bill_payments
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS needs_reconciliation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS asaas_bill_payments_client_request_id_key
  ON public.asaas_bill_payments (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS asaas_bill_payments_reconcile_idx
  ON public.asaas_bill_payments (needs_reconciliation)
  WHERE needs_reconciliation;