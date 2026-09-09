CREATE TABLE IF NOT EXISTS public.provider_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaair_order_id uuid,
  integration_order_id uuid REFERENCES public.integration_orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'ONER',
  cart_id text,
  purpose text NOT NULL DEFAULT 'ORIGINAL_QUOTE',
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_attempts_purpose_chk CHECK (purpose IN ('ORIGINAL_QUOTE','CARD_CHECKOUT','PIX_REBOOK'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_attempts TO authenticated;
GRANT ALL ON public.provider_attempts TO service_role;

ALTER TABLE public.provider_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados gerenciam tentativas de fornecedor"
ON public.provider_attempts FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS provider_attempts_order_idx ON public.provider_attempts (viaair_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS provider_attempts_integration_idx ON public.provider_attempts (integration_order_id, created_at DESC);

CREATE TRIGGER provider_attempts_touch BEFORE UPDATE ON public.provider_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.integration_orders
  ADD COLUMN IF NOT EXISTS original_cart_id text,
  ADD COLUMN IF NOT EXISTS fulfillment_cart_id text,
  ADD COLUMN IF NOT EXISTS customer_total numeric,
  ADD COLUMN IF NOT EXISTS provider_original_total numeric,
  ADD COLUMN IF NOT EXISTS viaair_margin numeric,
  ADD COLUMN IF NOT EXISTS commission_final numeric,
  ADD COLUMN IF NOT EXISTS provider_pix_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_payment_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_payment_authorized_by uuid,
  ADD COLUMN IF NOT EXISTS provider_payment_reference text;