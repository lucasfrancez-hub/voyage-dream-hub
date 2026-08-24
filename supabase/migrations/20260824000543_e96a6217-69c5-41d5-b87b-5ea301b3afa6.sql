CREATE TABLE public.comprefacil_pacotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  externo_id integer NOT NULL UNIQUE,
  nome text NOT NULL,
  referencia text,
  observacao text,
  cidade text,
  cidade_id integer,
  cidade_saida text,
  destino_id integer,
  moeda text,
  valor_servico numeric,
  valor_taxa numeric,
  dias integer,
  minimo_noites integer,
  validade_de timestamptz,
  validade_ate timestamptz,
  data_limite timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  destaque boolean NOT NULL DEFAULT false,
  sob_pedido boolean NOT NULL DEFAULT false,
  circuito boolean NOT NULL DEFAULT false,
  evento boolean NOT NULL DEFAULT false,
  casamento boolean NOT NULL DEFAULT false,
  quantidade_disponivel integer,
  imagens jsonb NOT NULL DEFAULT '[]'::jsonb,
  periodos jsonb NOT NULL DEFAULT '[]'::jsonb,
  inclui jsonb NOT NULL DEFAULT '[]'::jsonb,
  hoteis jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  visto_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cf_pacotes_nome ON public.comprefacil_pacotes (nome);
CREATE INDEX idx_cf_pacotes_ativo ON public.comprefacil_pacotes (ativo);

CREATE TABLE public.comprefacil_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  externo_id integer NOT NULL UNIQUE,
  titulo text NOT NULL,
  descricao text,
  tipo_id integer,
  tipo text,
  fornecedor_id integer,
  fornecedor text,
  fornecedor_cidade_id integer,
  internacional boolean NOT NULL DEFAULT false,
  combo boolean NOT NULL DEFAULT false,
  destaque boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  dias_semana text,
  prazo_cancelamento integer,
  politica_cancelamento text,
  dias_antecedencia integer,
  raw jsonb,
  visto_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cf_servicos_titulo ON public.comprefacil_servicos (titulo);
CREATE INDEX idx_cf_servicos_tipo ON public.comprefacil_servicos (tipo_id);

CREATE TABLE public.comprefacil_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo text NOT NULL,
  status text NOT NULL DEFAULT 'rodando',
  pacotes_novos integer NOT NULL DEFAULT 0,
  pacotes_atualizados integer NOT NULL DEFAULT 0,
  pacotes_inativados integer NOT NULL DEFAULT 0,
  servicos_novos integer NOT NULL DEFAULT 0,
  servicos_atualizados integer NOT NULL DEFAULT 0,
  servicos_inativados integer NOT NULL DEFAULT 0,
  erro text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comprefacil_pacotes TO authenticated;
GRANT ALL ON public.comprefacil_pacotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comprefacil_servicos TO authenticated;
GRANT ALL ON public.comprefacil_servicos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comprefacil_import_runs TO authenticated;
GRANT ALL ON public.comprefacil_import_runs TO service_role;

ALTER TABLE public.comprefacil_pacotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprefacil_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprefacil_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam pacotes CompreFacil" ON public.comprefacil_pacotes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins gerenciam servicos CompreFacil" ON public.comprefacil_servicos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins veem importacoes CompreFacil" ON public.comprefacil_import_runs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER cf_pacotes_updated_at BEFORE UPDATE ON public.comprefacil_pacotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cf_servicos_updated_at BEFORE UPDATE ON public.comprefacil_servicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();