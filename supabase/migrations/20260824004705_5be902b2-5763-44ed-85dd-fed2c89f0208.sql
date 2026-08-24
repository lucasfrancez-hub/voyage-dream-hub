CREATE TABLE public.comprefacil_sessions (
  id text PRIMARY KEY DEFAULT 'default',
  token text NOT NULL,
  expira_em timestamptz NOT NULL,
  agencia_id text,
  usuario_id text,
  fingerprint text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.comprefacil_sessions TO service_role;

ALTER TABLE public.comprefacil_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Somente servidor acessa sessoes CompreFacil"
ON public.comprefacil_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER comprefacil_sessions_touch
BEFORE UPDATE ON public.comprefacil_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();