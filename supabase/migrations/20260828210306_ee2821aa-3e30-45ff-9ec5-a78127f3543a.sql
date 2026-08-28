CREATE TABLE public.passport_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_request_id uuid NOT NULL REFERENCES public.passport_requests(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'infinitepay',
  order_nsu text NOT NULL UNIQUE,
  invoice_slug text,
  transaction_nsu text UNIQUE,
  amount integer NOT NULL DEFAULT 32000,
  paid_amount integer,
  installments integer,
  capture_method text,
  receipt_url text,
  checkout_url text,
  status text NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_passport_payments_request ON public.passport_payments(passport_request_id);
CREATE INDEX idx_passport_payments_status ON public.passport_payments(status);

GRANT SELECT ON public.passport_payments TO authenticated;
GRANT ALL ON public.passport_payments TO service_role;

ALTER TABLE public.passport_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada visualiza pagamentos de passaporte"
ON public.passport_payments FOR SELECT TO authenticated USING (true);

CREATE TRIGGER passport_payments_updated_at
BEFORE UPDATE ON public.passport_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.passport_payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_payment_id uuid REFERENCES public.passport_payments(id) ON DELETE CASCADE,
  order_nsu text,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_passport_payment_logs_payment ON public.passport_payment_logs(passport_payment_id);

GRANT SELECT ON public.passport_payment_logs TO authenticated;
GRANT ALL ON public.passport_payment_logs TO service_role;

ALTER TABLE public.passport_payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada visualiza logs de pagamento de passaporte"
ON public.passport_payment_logs FOR SELECT TO authenticated USING (true);