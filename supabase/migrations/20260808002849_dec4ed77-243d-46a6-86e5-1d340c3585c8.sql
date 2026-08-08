CREATE TABLE public.asaas_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft',
  asaas_transfer_id text UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  favored_name text NOT NULL,
  pix_key text NOT NULL,
  pix_key_type text,
  cpf_cnpj text,
  value numeric(14,2) NOT NULL,
  description text,
  scheduled_date date,
  effective_date date,
  origin text NOT NULL DEFAULT 'avulso',
  financial_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  receipt_url text,
  fail_reason text,
  authorized boolean NOT NULL DEFAULT false,
  authorized_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_ip text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_transfers TO authenticated;
GRANT ALL ON public.asaas_transfers TO service_role;
ALTER TABLE public.asaas_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage transfers" ON public.asaas_transfers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_asaas_transfers_updated BEFORE UPDATE ON public.asaas_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_asaas_transfers_status ON public.asaas_transfers(status);
CREATE INDEX idx_asaas_transfers_entry ON public.asaas_transfers(financial_entry_id);

CREATE TABLE public.asaas_transfer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid REFERENCES public.asaas_transfers(id) ON DELETE CASCADE,
  asaas_transfer_id text,
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
GRANT SELECT ON public.asaas_transfer_events TO authenticated;
GRANT ALL ON public.asaas_transfer_events TO service_role;
ALTER TABLE public.asaas_transfer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read transfer events" ON public.asaas_transfer_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_asaas_transfer_events_transfer ON public.asaas_transfer_events(transfer_id);

CREATE TABLE public.supplier_pix_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name text NOT NULL UNIQUE,
  favored_name text,
  pix_key text NOT NULL,
  pix_key_type text,
  cpf_cnpj text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_pix_keys TO authenticated;
GRANT ALL ON public.supplier_pix_keys TO service_role;
ALTER TABLE public.supplier_pix_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage supplier pix" ON public.supplier_pix_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_supplier_pix_keys_updated BEFORE UPDATE ON public.supplier_pix_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pix_baixa_tipo text,
  ADD COLUMN IF NOT EXISTS pix_manual_valor numeric(14,2),
  ADD COLUMN IF NOT EXISTS pix_manual_data date,
  ADD COLUMN IF NOT EXISTS pix_manual_obs text,
  ADD COLUMN IF NOT EXISTS pix_manual_comprovante_url text,
  ADD COLUMN IF NOT EXISTS pix_manual_by uuid,
  ADD COLUMN IF NOT EXISTS pix_manual_by_name text,
  ADD COLUMN IF NOT EXISTS pix_manual_at timestamptz;