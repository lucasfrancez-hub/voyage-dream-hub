CREATE TABLE public.asaas_bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  asaas_bill_id text,
  identification_field text NOT NULL,
  barcode text,
  beneficiary_name text,
  beneficiary_document text,
  value numeric NOT NULL DEFAULT 0,
  discount numeric,
  interest numeric,
  fine numeric,
  due_date date,
  scheduled_date date,
  effective_date date,
  paid_value numeric,
  status text NOT NULL DEFAULT 'pendente',
  fail_reason text,
  boleto_path text,
  description text,
  external_reference text,
  idempotency_key text NOT NULL UNIQUE,
  raw_simulation jsonb,
  raw_response jsonb,
  created_by uuid,
  created_by_name text,
  created_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_bill_payments TO authenticated;
GRANT ALL ON public.asaas_bill_payments TO service_role;

ALTER TABLE public.asaas_bill_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bill payments"
  ON public.asaas_bill_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_asaas_bill_payments_entry ON public.asaas_bill_payments(financial_entry_id);
CREATE INDEX idx_asaas_bill_payments_asaas ON public.asaas_bill_payments(asaas_bill_id);
CREATE INDEX idx_asaas_bill_payments_status ON public.asaas_bill_payments(status);

CREATE TRIGGER trg_asaas_bill_payments_updated_at
  BEFORE UPDATE ON public.asaas_bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.asaas_bill_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_payment_id uuid REFERENCES public.asaas_bill_payments(id) ON DELETE CASCADE,
  asaas_bill_id text,
  event text NOT NULL,
  status text,
  decision text,
  message text,
  actor_user_id uuid,
  actor_name text,
  ip text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.asaas_bill_payment_events TO authenticated;
GRANT ALL ON public.asaas_bill_payment_events TO service_role;

ALTER TABLE public.asaas_bill_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read bill payment events"
  ON public.asaas_bill_payment_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_asaas_bill_payment_events_bill ON public.asaas_bill_payment_events(bill_payment_id);

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS boleto_path text,
  ADD COLUMN IF NOT EXISTS boleto_line text,
  ADD COLUMN IF NOT EXISTS boleto_beneficiary text,
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS bill_payment_status text;