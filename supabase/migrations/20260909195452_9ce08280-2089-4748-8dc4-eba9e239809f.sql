ALTER TABLE public.integration_orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'CARD',
  ADD COLUMN IF NOT EXISTS commission_amount numeric,
  ADD COLUMN IF NOT EXISTS provider_net_amount numeric,
  ADD COLUMN IF NOT EXISTS search_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_notes text,
  ADD COLUMN IF NOT EXISTS manual_owner_user_id uuid;

ALTER TABLE public.integration_orders
  ADD CONSTRAINT integration_orders_payment_method_chk
  CHECK (payment_method IN ('CARD', 'PIX'));

CREATE INDEX IF NOT EXISTS integration_orders_pix_manual_idx
  ON public.integration_orders (payment_method, state, created_at DESC);