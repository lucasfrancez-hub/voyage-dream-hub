CREATE TABLE public.api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_code text not null unique,
  environment text not null default 'live',
  token_prefix text not null,
  token_hash text not null unique,
  token_last4 text not null,
  scopes text[] not null default '{}',
  active boolean not null default true,
  rate_limit_per_min integer not null default 120,
  webhook_url text,
  webhook_secret_hint text,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.api_clients TO authenticated;
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_clients admin read" ON public.api_clients FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.api_request_logs (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid references public.api_clients(id) on delete set null,
  endpoint text not null,
  method text not null,
  status integer not null,
  correlation_id text,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now()
);
CREATE INDEX api_request_logs_client_idx ON public.api_request_logs (api_client_id, created_at desc);
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_request_logs admin read" ON public.api_request_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid not null references public.api_clients(id) on delete cascade,
  idempotency_key text not null,
  endpoint text not null,
  request_hash text not null,
  status integer,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (api_client_id, idempotency_key, endpoint)
);
GRANT ALL ON public.api_idempotency_keys TO service_role;
ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.api_offer_refs (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid references public.api_clients(id) on delete set null,
  search_id text not null,
  kind text not null default 'outbound',
  payload jsonb not null,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now()
);
CREATE INDEX api_offer_refs_search_idx ON public.api_offer_refs (search_id);
GRANT ALL ON public.api_offer_refs TO service_role;
ALTER TABLE public.api_offer_refs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.api_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid not null references public.api_clients(id) on delete cascade,
  url text not null,
  secret text not null,
  active boolean not null default true,
  events text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT ALL ON public.api_webhook_endpoints TO service_role;
ALTER TABLE public.api_webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.api_webhook_events (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid references public.api_clients(id) on delete set null,
  event text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
CREATE INDEX api_webhook_events_pending_idx ON public.api_webhook_events (status, next_attempt_at);
GRANT SELECT ON public.api_webhook_events TO authenticated;
GRANT ALL ON public.api_webhook_events TO service_role;
ALTER TABLE public.api_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_webhook_events admin read" ON public.api_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.api_webhook_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.api_webhook_events(id) on delete cascade,
  attempt integer not null,
  status integer,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
GRANT ALL ON public.api_webhook_attempts TO service_role;
ALTER TABLE public.api_webhook_attempts ENABLE ROW LEVEL SECURITY;