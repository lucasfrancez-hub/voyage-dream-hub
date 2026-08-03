CREATE TABLE public.wa_calendar_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL DEFAULT 'titan',
  server_url text NOT NULL DEFAULT 'https://dav.titan.email',
  username text,
  password text,
  calendar_url text,
  calendar_nome text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ativo boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT (id, provider, server_url, username, calendar_url, calendar_nome, timezone, ativo, last_sync_at, last_error, created_at, updated_at) ON public.wa_calendar_config TO authenticated;
GRANT ALL ON public.wa_calendar_config TO service_role;

ALTER TABLE public.wa_calendar_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem a configuracao da agenda"
  ON public.wa_calendar_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wa_calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,
  etag text,
  href text,
  titulo text NOT NULL DEFAULT '',
  descricao text,
  local text,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  dia_inteiro boolean NOT NULL DEFAULT false,
  situacao text NOT NULL DEFAULT 'confirmado',
  origem text NOT NULL DEFAULT 'titan',
  telefone text,
  conversation_id uuid,
  criado_por text,
  raw_ics text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_calendar_events_uid_key UNIQUE (uid)
);

CREATE INDEX wa_calendar_events_inicio_idx ON public.wa_calendar_events (inicio);
CREATE INDEX wa_calendar_events_telefone_idx ON public.wa_calendar_events (telefone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_calendar_events TO authenticated;
GRANT ALL ON public.wa_calendar_events TO service_role;

ALTER TABLE public.wa_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe gerencia compromissos"
  ON public.wa_calendar_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE TRIGGER update_wa_calendar_config_updated_at
  BEFORE UPDATE ON public.wa_calendar_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wa_calendar_events_updated_at
  BEFORE UPDATE ON public.wa_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();