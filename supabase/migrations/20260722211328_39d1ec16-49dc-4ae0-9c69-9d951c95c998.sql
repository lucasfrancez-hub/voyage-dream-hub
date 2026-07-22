
CREATE TABLE public.login_email_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_email_codes_user_active_idx
  ON public.login_email_codes (user_id) WHERE consumed_at IS NULL;

GRANT ALL ON public.login_email_codes TO service_role;

ALTER TABLE public.login_email_codes ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: apenas service_role (server functions) acessa esta tabela.
