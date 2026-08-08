CREATE TABLE public.asaas_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('pix','boleto')),
  status text NOT NULL DEFAULT 'pendente',
  customer_name text NOT NULL,
  customer_cpf_cnpj text,
  customer_email text,
  customer_phone text,
  value numeric(12,2) NOT NULL,
  due_date date,
  description text,
  asaas_payment_id text UNIQUE,
  asaas_customer_id text,
  invoice_url text,
  bank_slip_url text,
  identification_field text,
  pix_payload text,
  pix_qr_image text,
  expira_em timestamptz,
  paid_at timestamptz,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid,
  created_by_name text,
  raw_response jsonb,
  webhook_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_recebimentos TO authenticated;
GRANT ALL ON public.asaas_recebimentos TO service_role;

ALTER TABLE public.asaas_recebimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam recebimentos"
ON public.asaas_recebimentos FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_asaas_recebimentos_updated
BEFORE UPDATE ON public.asaas_recebimentos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_asaas_recebimentos_created ON public.asaas_recebimentos (created_at DESC);