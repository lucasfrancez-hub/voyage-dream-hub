CREATE TABLE public.comprefacil_busca_cache (
  token TEXT NOT NULL,
  tipo TEXT NOT NULL,
  itens JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (token, tipo)
);
GRANT ALL ON public.comprefacil_busca_cache TO service_role;
ALTER TABLE public.comprefacil_busca_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.frt_reservas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orcamento_id BIGINT NOT NULL UNIQUE,
  localizador_aereo TEXT,
  localizador_hotel TEXT,
  limite_emissao TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.frt_reservas TO authenticated;
GRANT ALL ON public.frt_reservas TO service_role;
ALTER TABLE public.frt_reservas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view frt reservas" ON public.frt_reservas FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_frt_reservas_created_at ON public.frt_reservas (created_at DESC);