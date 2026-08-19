CREATE TABLE public.asaas_card_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  venda_ref text,
  atendente_id uuid,
  atendente_nome text,
  descricao text,
  cliente_nome text,
  cliente_documento text,
  cliente_email text,
  cliente_telefone text,
  valor numeric(12,2) NOT NULL,
  parcelas integer NOT NULL DEFAULT 1,
  valor_parcela numeric(12,2),
  billing_type text NOT NULL DEFAULT 'CREDIT_CARD',
  external_reference text,
  asaas_payment_id text UNIQUE,
  asaas_customer_id text,
  asaas_installment_id text,
  status text NOT NULL DEFAULT 'indefinido',
  asaas_status text,
  date_created date,
  confirmed_date date,
  payment_date date,
  credit_date date,
  valor_bruto numeric(12,2),
  valor_liquido numeric(12,2),
  taxas numeric(12,2),
  card_brand text,
  card_last4 text,
  card_token text,
  card_holder_name text,
  authorization_code text,
  nsu text,
  tid text,
  acquirer_transaction_id text,
  anticipation_status text,
  chargeback_status text,
  erro_codigo text,
  erro_mensagem text,
  raw jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_card_charges TO authenticated;
GRANT ALL ON public.asaas_card_charges TO service_role;
ALTER TABLE public.asaas_card_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam cobrancas de cartao" ON public.asaas_card_charges
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_asaas_card_charges_updated BEFORE UPDATE ON public.asaas_card_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_asaas_card_charges_order ON public.asaas_card_charges(order_id);
CREATE INDEX idx_asaas_card_charges_created ON public.asaas_card_charges(created_at DESC);

CREATE TABLE public.asaas_anticipations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  charge_id uuid REFERENCES public.asaas_card_charges(id) ON DELETE SET NULL,
  asaas_anticipation_id text UNIQUE,
  asaas_payment_id text,
  asaas_installment_id text,
  status text NOT NULL DEFAULT 'PENDING',
  requested_at timestamptz,
  scheduled_date date,
  credit_date date,
  valor_bruto numeric(12,2),
  taxa numeric(12,2),
  valor_liquido numeric(12,2),
  parcelas_antecipadas integer,
  denial_reason text,
  raw jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_anticipations TO authenticated;
GRANT ALL ON public.asaas_anticipations TO service_role;
ALTER TABLE public.asaas_anticipations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam antecipacoes" ON public.asaas_anticipations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_asaas_anticipations_updated BEFORE UPDATE ON public.asaas_anticipations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_asaas_anticipations_charge ON public.asaas_anticipations(charge_id);

CREATE TABLE public.asaas_charge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  charge_id uuid REFERENCES public.asaas_card_charges(id) ON DELETE CASCADE,
  anticipation_id uuid REFERENCES public.asaas_anticipations(id) ON DELETE SET NULL,
  asaas_event_id text UNIQUE,
  event_type text NOT NULL,
  asaas_payment_id text,
  asaas_anticipation_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  status_anterior text,
  status_novo text,
  resultado text,
  payload jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_charge_events TO authenticated;
GRANT ALL ON public.asaas_charge_events TO service_role;
ALTER TABLE public.asaas_charge_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem historico de cobrancas" ON public.asaas_charge_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_asaas_charge_events_charge ON public.asaas_charge_events(charge_id, received_at DESC);