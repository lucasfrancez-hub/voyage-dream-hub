CREATE TABLE public.pix_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txid text NOT NULL UNIQUE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  qr_code text NOT NULL,
  qr_code_image text,
  status text NOT NULL DEFAULT 'ativa',
  expira_em timestamptz NOT NULL,
  pago_em timestamptz,
  e2eid text,
  payer_name text,
  payer_document text,
  raw_response jsonb,
  webhook_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pix_cobrancas_order_idx ON public.pix_cobrancas(order_id);
CREATE INDEX pix_cobrancas_status_idx ON public.pix_cobrancas(status);
CREATE INDEX pix_cobrancas_expira_idx ON public.pix_cobrancas(expira_em);

GRANT SELECT ON public.pix_cobrancas TO authenticated;
GRANT ALL ON public.pix_cobrancas TO service_role;

ALTER TABLE public.pix_cobrancas ENABLE ROW LEVEL SECURITY;

-- Admin lê tudo
CREATE POLICY "admin_read_pix" ON public.pix_cobrancas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Dono do pedido lê a própria cobrança (para exibir status na tela do cliente logado, se houver)
CREATE POLICY "owner_read_pix" ON public.pix_cobrancas
  FOR SELECT TO authenticated
  USING (
    order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.owner_user_id = auth.uid()
    )
  );

-- Trigger updated_at
CREATE TRIGGER pix_cobrancas_set_updated_at
  BEFORE UPDATE ON public.pix_cobrancas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();