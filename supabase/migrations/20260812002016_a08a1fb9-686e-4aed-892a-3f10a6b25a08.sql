CREATE TABLE public.pagamentos_externos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  banco_nome text NOT NULL,
  banco_codigo text,
  forma_pagamento text NOT NULL DEFAULT 'boleto',
  valor numeric NOT NULL DEFAULT 0,
  valor_original numeric,
  juros numeric,
  multa numeric,
  desconto numeric,
  data_pagamento timestamptz NOT NULL DEFAULT now(),
  data_vencimento date,
  beneficiario_nome text,
  beneficiario_documento text,
  pagador_nome text,
  pagador_documento text,
  conta_debito text,
  descricao text,
  autenticacao text,
  linha_digitavel text,
  documento_path text,
  raw_extracao jsonb,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagamentos_externos TO authenticated;
GRANT ALL ON public.pagamentos_externos TO service_role;

ALTER TABLE public.pagamentos_externos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage external payments"
  ON public.pagamentos_externos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_pagamentos_externos_entry ON public.pagamentos_externos(financial_entry_id);
CREATE INDEX idx_pagamentos_externos_data ON public.pagamentos_externos(data_pagamento DESC);
CREATE INDEX idx_pagamentos_externos_banco ON public.pagamentos_externos(banco_nome);

CREATE TRIGGER trg_pagamentos_externos_updated_at
  BEFORE UPDATE ON public.pagamentos_externos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();