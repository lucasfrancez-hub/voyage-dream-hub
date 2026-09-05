CREATE TABLE public.passhub_sessions (
  id text PRIMARY KEY,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.passhub_sessions TO service_role;

ALTER TABLE public.passhub_sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER passhub_sessions_touch
BEFORE UPDATE ON public.passhub_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();