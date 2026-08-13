CREATE TABLE IF NOT EXISTS public.airfare_promo_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  trigger text NOT NULL DEFAULT 'manual',
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  saved integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_label text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.airfare_promo_runs TO authenticated;
GRANT ALL ON public.airfare_promo_runs TO service_role;

ALTER TABLE public.airfare_promo_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view airfare promo runs" ON public.airfare_promo_runs;
CREATE POLICY "Admins can view airfare promo runs"
ON public.airfare_promo_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS airfare_promo_runs_single_active
ON public.airfare_promo_runs ((status)) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS airfare_promo_runs_started_idx
ON public.airfare_promo_runs (started_at DESC);

SELECT cron.unschedule('airfare-promos-collect');

SELECT cron.schedule(
  'airfare-promos-collect',
  '0 9,15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pedidos.viaair.tur.br/api/public/hooks/airfare-promos',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_ORdy5AQjrPReq3MPcnLDQQ_7iEblv-F"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  ) as request_id;
  $$
);