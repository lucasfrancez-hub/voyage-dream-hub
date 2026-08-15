CREATE TABLE public.frt_auth_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  sender text,
  subject text,
  received_at timestamptz not null default now(),
  used_at timestamptz
);
CREATE INDEX frt_auth_codes_recent_idx ON public.frt_auth_codes (received_at DESC);
GRANT ALL ON public.frt_auth_codes TO service_role;
ALTER TABLE public.frt_auth_codes ENABLE ROW LEVEL SECURITY;