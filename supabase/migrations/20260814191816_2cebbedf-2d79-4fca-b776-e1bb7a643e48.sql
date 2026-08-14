CREATE TABLE public.expedia_credentials (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Expedia TAAP',
  account_email text not null,
  password_encrypted text not null,
  status text not null default 'ACTIVE',
  last_login_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT ALL ON public.expedia_credentials TO service_role;
ALTER TABLE public.expedia_credentials ENABLE ROW LEVEL SECURITY;
-- Sem políticas para anon/authenticated: acesso apenas pelo backend confiável.