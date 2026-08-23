CREATE TABLE public.auth_code_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  login_hint text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'aguardando_codigo',
  expected_senders text[] NOT NULL DEFAULT '{}',
  expected_subjects text[] NOT NULL DEFAULT '{}',
  gmail_message_id text,
  sender text,
  subject text,
  received_at timestamptz,
  code_mask text,
  code_used_at timestamptz,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_code_attempts_provider_idx ON public.auth_code_attempts (provider, requested_at DESC);
CREATE INDEX auth_code_attempts_message_idx ON public.auth_code_attempts (gmail_message_id);

GRANT ALL ON public.auth_code_attempts TO service_role;
ALTER TABLE public.auth_code_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_code_attempts_service_only"
  ON public.auth_code_attempts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER auth_code_attempts_updated_at
  BEFORE UPDATE ON public.auth_code_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();