-- Camada financeira genérica da VIA AIR (carteira/orquestradora).
-- Pagamento 1: cliente -> VIA AIR (wallet_charges)
-- Pagamento 2: VIA AIR -> Pix interno de fornecedor (wallet_payouts)
-- Os dois ciclos são independentes e nunca se sobrescrevem.

CREATE TABLE public.wallet_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL,
  external_reference text NOT NULL UNIQUE,
  order_ref text,
  booking_ref text,
  service_ref text,
  agency_ref text,
  description text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'awaiting_customer_payment',
  payer_name text,
  payer_document text,
  payer_email text,
  asaas_payment_id text,
  asaas_customer_id text,
  qr_code text,
  qr_code_image text,
  invoice_url text,
  callback_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  paid_amount numeric(12,2),
  refund_status text,
  refunded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_charges_client ON public.wallet_charges(api_client_id);
CREATE INDEX idx_wallet_charges_asaas ON public.wallet_charges(asaas_payment_id);
CREATE INDEX idx_wallet_charges_order ON public.wallet_charges(order_ref);
CREATE INDEX idx_wallet_charges_status ON public.wallet_charges(status);

GRANT ALL ON public.wallet_charges TO service_role;
ALTER TABLE public.wallet_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_charges service only"
  ON public.wallet_charges FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.wallet_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL,
  charge_id uuid REFERENCES public.wallet_charges(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  external_reference text,
  order_ref text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BRL',
  pix_copy_paste text NOT NULL,
  receiver_name text,
  receiver_document text,
  bank_name text,
  status text NOT NULL DEFAULT 'pending',
  fail_code text,
  fail_reason text,
  asaas_transfer_id text,
  transfer_row_id uuid,
  expires_at timestamptz,
  paid_at timestamptz,
  paid_amount numeric(12,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_client_id, idempotency_key)
);

CREATE INDEX idx_wallet_payouts_charge ON public.wallet_payouts(charge_id);
CREATE INDEX idx_wallet_payouts_status ON public.wallet_payouts(status);
CREATE INDEX idx_wallet_payouts_transfer ON public.wallet_payouts(asaas_transfer_id);

GRANT ALL ON public.wallet_payouts TO service_role;
ALTER TABLE public.wallet_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_payouts service only"
  ON public.wallet_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.wallet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid REFERENCES public.wallet_charges(id) ON DELETE CASCADE,
  payout_id uuid REFERENCES public.wallet_payouts(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text,
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_events_charge ON public.wallet_events(charge_id, created_at DESC);
CREATE INDEX idx_wallet_events_payout ON public.wallet_events(payout_id, created_at DESC);

GRANT ALL ON public.wallet_events TO service_role;
ALTER TABLE public.wallet_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_events service only"
  ON public.wallet_events FOR ALL TO service_role USING (true) WITH CHECK (true);