ALTER TABLE public.airfare_promotions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS airfare_promotions_archived_idx ON public.airfare_promotions (archived_at);

SELECT cron.unschedule('airfare-promos-midnight') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='airfare-promos-midnight');

SELECT cron.schedule(
  'airfare-promos-midnight',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://pedidos.viaair.tur.br/api/public/hooks/airfare-promos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"trigger":"midnight"}'::jsonb
  );
  $$
);