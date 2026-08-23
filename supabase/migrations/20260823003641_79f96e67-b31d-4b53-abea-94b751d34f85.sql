CREATE TABLE public.passhub_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_passagem bigint NOT NULL,
  localizador text,
  modo text NOT NULL DEFAULT 'cobranca_cliente',
  valor_passhub numeric(12,2) NOT NULL DEFAULT 0,
  markup numeric(12,2) NOT NULL DEFAULT 0,
  valor_cobrado numeric(12,2) NOT NULL DEFAULT 0,
  cliente_nome text,
  cliente_documento text,
  cliente_email text,
  cliente_telefone text,
  asaas_payment_id text,
  pix_copia_cola text,
  pix_qr_base64 text,
  pix_expira_em timestamptz,
  passhub_brcode text,
  passhub_link text,
  status text NOT NULL DEFAULT 'aguardando',
  recebido_em timestamptz,
  repasse_transfer_id text,
  repasse_status text,
  repasse_valor numeric(12,2),
  repasse_em timestamptz,
  repasse_erro text,
  auto_repasse boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX passhub_pagamentos_passagem_idx ON public.passhub_pagamentos (id_passagem);
CREATE INDEX passhub_pagamentos_asaas_idx ON public.passhub_pagamentos (asaas_payment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passhub_pagamentos TO authenticated;
GRANT ALL ON public.passhub_pagamentos TO service_role;

ALTER TABLE public.passhub_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam pagamentos passhub"
ON public.passhub_pagamentos FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER passhub_pagamentos_touch
BEFORE UPDATE ON public.passhub_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();