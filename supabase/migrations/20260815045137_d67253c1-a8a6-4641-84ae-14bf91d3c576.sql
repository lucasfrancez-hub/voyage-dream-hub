CREATE TABLE public.frt_sessions (
  id text PRIMARY KEY DEFAULT 'default',
  cookies jsonb NOT NULL DEFAULT '{}'::jsonb,
  view_state text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.frt_sessions TO service_role;
ALTER TABLE public.frt_sessions ENABLE ROW LEVEL SECURITY;