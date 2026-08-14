ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS source_booking_id text,
  ADD COLUMN IF NOT EXISTS source_booking_index text,
  ADD COLUMN IF NOT EXISTS source_company_code text,
  ADD COLUMN IF NOT EXISTS source_token text,
  ADD COLUMN IF NOT EXISTS options_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS public_url text,
  ADD COLUMN IF NOT EXISTS short_url text,
  ADD COLUMN IF NOT EXISTS public_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS converted_option_number integer,
  ADD COLUMN IF NOT EXISTS converted_package_id uuid,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS quotes_source_booking_id_idx ON public.quotes (source_booking_id);

CREATE TABLE IF NOT EXISTS public.quote_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  option_number integer NOT NULL,
  label text,
  start_date date,
  end_date date,
  destination text,
  hotel_name text,
  product_kinds text[] NOT NULL DEFAULT '{}',
  total numeric,
  currency text DEFAULT 'BRL',
  payment_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, option_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_options TO authenticated;
GRANT ALL ON public.quote_options TO service_role;

ALTER TABLE public.quote_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados gerenciam opcoes de orcamento"
  ON public.quote_options FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS quote_options_quote_id_idx ON public.quote_options (quote_id, option_number);

CREATE TRIGGER quote_options_touch BEFORE UPDATE ON public.quote_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();