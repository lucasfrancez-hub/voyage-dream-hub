CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number bigserial,
  quote_type text NOT NULL DEFAULT 'TRIP_PACKAGE',
  status text NOT NULL DEFAULT 'DRAFT',
  title text,
  client_name text,
  client_phone text,
  client_email text,
  origin text,
  destination text,
  start_date date,
  end_date date,
  total numeric,
  currency text DEFAULT 'BRL',
  consultant text,
  source text NOT NULL DEFAULT 'MANUAL',
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_quote_id text,
  source_import_id uuid,
  converted_order_id uuid,
  owner_user_id uuid,
  version int NOT NULL DEFAULT 1,
  fingerprint text UNIQUE,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.quotes_quote_number_seq TO authenticated, service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_staff_all" ON public.quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX quotes_created_idx ON public.quotes (created_at DESC);

CREATE TABLE public.quote_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'INFOTRAVEL',
  source_url text NOT NULL,
  source_id text,
  fingerprint text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PROCESSING',
  http_status int,
  source_html text,
  source_payload jsonb,
  parsed_payload jsonb,
  error text,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  created_by uuid,
  browser_extension boolean NOT NULL DEFAULT false,
  detected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_imports TO authenticated;
GRANT ALL ON public.quote_imports TO service_role;
ALTER TABLE public.quote_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quote_imports_staff_all" ON public.quote_imports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX quote_imports_created_idx ON public.quote_imports (created_at DESC);

CREATE TABLE public.extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  label text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_tokens TO authenticated;
GRANT ALL ON public.extension_tokens TO service_role;
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extension_tokens_own" ON public.extension_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());