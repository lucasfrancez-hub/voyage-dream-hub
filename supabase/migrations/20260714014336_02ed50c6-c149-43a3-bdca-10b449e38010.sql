
CREATE TABLE public.flight_import_staging (
  token text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  airline_hint text,
  source_url text,
  raw_text text,
  parsed jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX flight_import_staging_order_idx ON public.flight_import_staging(order_id);
CREATE INDEX flight_import_staging_expires_idx ON public.flight_import_staging(expires_at);

GRANT ALL ON public.flight_import_staging TO service_role;
-- No grants to anon/authenticated: acesso apenas via server function com token.

ALTER TABLE public.flight_import_staging ENABLE ROW LEVEL SECURITY;
-- Sem policies: nenhum acesso via PostgREST. Server functions usam supabaseAdmin.

CREATE TRIGGER trg_flight_import_staging_updated_at
BEFORE UPDATE ON public.flight_import_staging
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
