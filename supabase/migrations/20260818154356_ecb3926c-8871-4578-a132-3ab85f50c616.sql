CREATE TABLE public.cativa_pacotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL,
  categoria text,
  nome text NOT NULL,
  nome_normalizado text NOT NULL,
  origem_iata text,
  origem_cidade text,
  uf text,
  destino text,
  data_viagem date,
  data_viagem_texto text,
  data_fim date,
  outras_datas text[] NOT NULL DEFAULT '{}',
  noites integer,
  token_infotravel text,
  link_orcamento text,
  aereo_de numeric,
  aereo_por numeric,
  taxas numeric,
  valor_total numeric,
  moeda text NOT NULL DEFAULT 'BRL',
  hoteis jsonb NOT NULL DEFAULT '[]'::jsonb,
  ingressos jsonb NOT NULL DEFAULT '[]'::jsonb,
  incluso text[] NOT NULL DEFAULT '{}',
  observacao text,
  cotado_em text,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_row_key text,
  fingerprint text NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  primeira_vez_em timestamptz NOT NULL DEFAULT now(),
  visto_em timestamptz NOT NULL DEFAULT now(),
  voos_status text NOT NULL DEFAULT 'pendente',
  voos_prioridade integer NOT NULL DEFAULT 100,
  voos_atualizado_em timestamptz,
  voos_proxima_em timestamptz NOT NULL DEFAULT now(),
  voos_tentativas integer NOT NULL DEFAULT 0,
  voos_erro text,
  voos_opcoes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cativa_pacotes_fingerprint_key ON public.cativa_pacotes (fingerprint);
CREATE INDEX cativa_pacotes_status_idx ON public.cativa_pacotes (status);
CREATE INDEX cativa_pacotes_origem_idx ON public.cativa_pacotes (origem_iata);
CREATE INDEX cativa_pacotes_destino_idx ON public.cativa_pacotes (destino);
CREATE INDEX cativa_pacotes_fila_idx ON public.cativa_pacotes (voos_status, voos_prioridade, voos_proxima_em);

GRANT SELECT ON public.cativa_pacotes TO anon;
GRANT SELECT ON public.cativa_pacotes TO authenticated;
GRANT ALL ON public.cativa_pacotes TO service_role;
ALTER TABLE public.cativa_pacotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pacotes ativos sao publicos" ON public.cativa_pacotes FOR SELECT TO anon, authenticated USING (status = 'ativo');
CREATE POLICY "Admins veem todos os pacotes" ON public.cativa_pacotes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.cativa_pacote_voos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pacote_id uuid NOT NULL REFERENCES public.cativa_pacotes(id) ON DELETE CASCADE,
  opcao_numero integer NOT NULL,
  label text,
  companhia text,
  total numeric,
  moeda text NOT NULL DEFAULT 'BRL',
  voos jsonb NOT NULL DEFAULT '[]'::jsonb,
  hoteis jsonb NOT NULL DEFAULT '[]'::jsonb,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cativa_pacote_voos_unico ON public.cativa_pacote_voos (pacote_id, opcao_numero);

GRANT SELECT ON public.cativa_pacote_voos TO anon;
GRANT SELECT ON public.cativa_pacote_voos TO authenticated;
GRANT ALL ON public.cativa_pacote_voos TO service_role;
ALTER TABLE public.cativa_pacote_voos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Voos de pacotes ativos sao publicos" ON public.cativa_pacote_voos FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.cativa_pacotes p WHERE p.id = pacote_id AND p.status = 'ativo'));
CREATE POLICY "Admins veem todos os voos" ON public.cativa_pacote_voos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.cativa_pacote_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pacote_id uuid NOT NULL REFERENCES public.cativa_pacotes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  campo text,
  valor_anterior text,
  valor_novo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cativa_pacote_historico_pacote_idx ON public.cativa_pacote_historico (pacote_id, created_at DESC);

GRANT SELECT ON public.cativa_pacote_historico TO authenticated;
GRANT ALL ON public.cativa_pacote_historico TO service_role;
ALTER TABLE public.cativa_pacote_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem o historico" ON public.cativa_pacote_historico FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.cativa_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL DEFAULT 'todas',
  status text NOT NULL DEFAULT 'running',
  linhas integer NOT NULL DEFAULT 0,
  novos integer NOT NULL DEFAULT 0,
  alterados integer NOT NULL DEFAULT 0,
  inalterados integer NOT NULL DEFAULT 0,
  removidos integer NOT NULL DEFAULT 0,
  infotravel_chamadas integer NOT NULL DEFAULT 0,
  infotravel_evitadas integer NOT NULL DEFAULT 0,
  infotravel_erros integer NOT NULL DEFAULT 0,
  erro text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  duracao_ms integer
);

CREATE INDEX cativa_import_runs_recentes_idx ON public.cativa_import_runs (iniciado_em DESC);

GRANT SELECT ON public.cativa_import_runs TO authenticated;
GRANT ALL ON public.cativa_import_runs TO service_role;
ALTER TABLE public.cativa_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem as execucoes" ON public.cativa_import_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.cativa_job_locks (
  nome text PRIMARY KEY,
  expira_em timestamptz NOT NULL DEFAULT now(),
  pausado boolean NOT NULL DEFAULT false,
  pausado_motivo text,
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cativa_job_locks TO authenticated;
GRANT ALL ON public.cativa_job_locks TO service_role;
ALTER TABLE public.cativa_job_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem as travas" ON public.cativa_job_locks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER cativa_pacotes_touch BEFORE UPDATE ON public.cativa_pacotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cativa_pacote_voos_touch BEFORE UPDATE ON public.cativa_pacote_voos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();