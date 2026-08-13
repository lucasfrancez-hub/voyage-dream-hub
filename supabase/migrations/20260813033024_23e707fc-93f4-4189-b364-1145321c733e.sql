ALTER TABLE public.airfare_promotions
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS archived_cycle_day date;

CREATE INDEX IF NOT EXISTS airfare_promotions_archived_at_idx ON public.airfare_promotions (archived_at DESC);
CREATE INDEX IF NOT EXISTS airfare_promotions_cycle_day_idx ON public.airfare_promotions (cycle_day);

SELECT cron.unschedule('airfare-promos-cleanup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='airfare-promos-cleanup');

SELECT cron.schedule(
  'airfare-promos-cleanup',
  '10 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pedidos.viaair.tur.br/api/public/hooks/airfare-promos',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_ORdy5AQjrPReq3MPcnLDQQ_7iEblv-F"}'::jsonb,
    body := '{"trigger":"cleanup"}'::jsonb
  );
  $$
);