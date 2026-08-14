CREATE TABLE public.expedia_sessions (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Expedia TAAP',
  account_email text,
  cookies_encrypted text,
  storage_encrypted text,
  status text not null default 'AUTH_REQUIRED',
  last_validated_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE public.expedia_search_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.expedia_sessions(id) on delete set null,
  search_type text not null default 'HOTEL_STANDALONE',
  params jsonb not null default '{}'::jsonb,
  url text,
  status text not null,
  duration_ms integer,
  results_count integer,
  source_level text,
  parser_errors jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX idx_expedia_search_logs_created_at ON public.expedia_search_logs (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expedia_sessions TO authenticated;
GRANT ALL ON public.expedia_sessions TO service_role;
GRANT SELECT, INSERT ON public.expedia_search_logs TO authenticated;
GRANT ALL ON public.expedia_search_logs TO service_role;

ALTER TABLE public.expedia_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expedia_search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expedia_sessions_admin_all" ON public.expedia_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "expedia_search_logs_admin_read" ON public.expedia_search_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "expedia_search_logs_admin_insert" ON public.expedia_search_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_expedia_sessions_updated_at
  BEFORE UPDATE ON public.expedia_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();