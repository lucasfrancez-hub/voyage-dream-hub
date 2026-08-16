CREATE TABLE public.multicity_quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  segments jsonb NOT NULL,
  pax jsonb NOT NULL DEFAULT '{"adults":1,"children":0,"infants":0}'::jsonb,
  picks jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_price numeric,
  label text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '60 days')
);

GRANT SELECT, INSERT, UPDATE ON public.multicity_quotes TO authenticated;
GRANT ALL ON public.multicity_quotes TO service_role;

ALTER TABLE public.multicity_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe pode ver cotacoes multitrecho"
  ON public.multicity_quotes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Equipe pode criar cotacoes multitrecho"
  ON public.multicity_quotes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Equipe pode atualizar cotacoes multitrecho"
  ON public.multicity_quotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX multicity_quotes_token_idx ON public.multicity_quotes (token);

CREATE TRIGGER update_multicity_quotes_updated_at
  BEFORE UPDATE ON public.multicity_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();