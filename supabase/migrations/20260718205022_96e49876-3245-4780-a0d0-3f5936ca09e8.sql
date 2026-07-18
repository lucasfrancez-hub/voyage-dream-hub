
CREATE TABLE IF NOT EXISTS public.nfse_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text NOT NULL,
  inscricao_municipal text NOT NULL,
  razao_social text NOT NULL DEFAULT 'VIA AIR',
  regime_tributario text NOT NULL DEFAULT 'normal',
  item_lista_servico text NOT NULL DEFAULT '9.02',
  codigo_tributario_municipio text,
  aliquota_iss numeric(5,2) NOT NULL DEFAULT 4.00,
  iss_retido boolean NOT NULL DEFAULT false,
  municipio_prestacao text NOT NULL DEFAULT 'Paranavaí',
  uf_prestacao text NOT NULL DEFAULT 'PR',
  descricao_padrao text DEFAULT 'Organização, promoção e execução de programas de turismo, passeios, viagens, excursões, hospedagens e congêneres.',
  ambiente text NOT NULL DEFAULT 'producao' CHECK (ambiente IN ('producao','homologacao')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_config TO authenticated;
GRANT ALL ON public.nfse_config TO service_role;
ALTER TABLE public.nfse_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage nfse_config" ON public.nfse_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.nfse_config (cnpj, inscricao_municipal, aliquota_iss, item_lista_servico, codigo_tributario_municipio)
VALUES ('56339877000166', '121788', 4.00, '9.02', '90202')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.nfse_emissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'processando',
  numero_nfse text,
  serie text,
  codigo_verificacao text,
  chave_acesso text,
  data_emissao timestamptz,
  url_pdf text,
  url_xml text,
  valor_servicos numeric(14,2) NOT NULL,
  valor_iss numeric(14,2),
  aliquota_iss numeric(5,2),
  tomador jsonb NOT NULL,
  discriminacao text NOT NULL,
  focus_ref text,
  focus_status text,
  focus_response jsonb,
  motivo_cancelamento text,
  cancelada_em timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_emissoes TO authenticated;
GRANT ALL ON public.nfse_emissoes TO service_role;
ALTER TABLE public.nfse_emissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read nfse" ON public.nfse_emissoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write nfse" ON public.nfse_emissoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_nfse_emissoes_order ON public.nfse_emissoes(order_id);
CREATE INDEX IF NOT EXISTS idx_nfse_emissoes_status ON public.nfse_emissoes(status);
