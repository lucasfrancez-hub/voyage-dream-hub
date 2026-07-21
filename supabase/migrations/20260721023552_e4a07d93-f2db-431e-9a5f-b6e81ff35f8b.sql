
CREATE TABLE IF NOT EXISTS public.monde_sync_state (
  id text PRIMARY KEY,
  last_synced_at timestamptz,
  last_page integer,
  total_records integer,
  imported_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idle',
  error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.monde_sync_state TO authenticated;
GRANT ALL ON public.monde_sync_state TO service_role;
ALTER TABLE public.monde_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read monde sync state"
  ON public.monde_sync_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
