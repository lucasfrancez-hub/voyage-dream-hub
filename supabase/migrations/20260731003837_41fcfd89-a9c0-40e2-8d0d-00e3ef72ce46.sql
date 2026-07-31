DO $$
BEGIN
  PERFORM cron.unschedule('flight-quote-watchdog');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'flight-quote-watchdog',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/flight-quote-watchdog',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;