
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cashier_number text,
  status text NOT NULL DEFAULT 'pending',
  method text NOT NULL,
  description text,
  installments integer,
  installment_amount numeric(12,2),
  amount numeric(12,2) NOT NULL,
  provider text,
  proposal_number text,
  authorization_code text,
  card_last4 text,
  card_brand text,
  paid_at timestamptz,
  added_by_name text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_payments TO authenticated;
GRANT ALL ON public.order_payments TO service_role;

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage order payments"
  ON public.order_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner reads own order payments by email"
  ON public.order_payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND lower(o.email) = lower((auth.jwt() ->> 'email'))
  ));

CREATE INDEX idx_order_payments_order ON public.order_payments(order_id);

CREATE TRIGGER trg_order_payments_updated
  BEFORE UPDATE ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
