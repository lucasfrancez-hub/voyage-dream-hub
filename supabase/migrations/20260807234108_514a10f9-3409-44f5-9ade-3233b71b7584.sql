ALTER TABLE public.pix_cobrancas
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'itau',
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS invoice_url text;

CREATE UNIQUE INDEX IF NOT EXISTS pix_cobrancas_asaas_payment_id_key
  ON public.pix_cobrancas (asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;