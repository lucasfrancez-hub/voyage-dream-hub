
ALTER TABLE public.wa_protocolos
  ADD COLUMN IF NOT EXISTS inactivity_warned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wa_protocolos_status_warned
  ON public.wa_protocolos(status, inactivity_warned_at, last_activity_at);

-- Cron: aciona o hook de inatividade a cada 10 min
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'protocol-inactivity') THEN
    PERFORM cron.unschedule('protocol-inactivity');
  END IF;

  PERFORM cron.schedule(
    'protocol-inactivity',
    '*/10 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/close-inactive-protocols',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;
