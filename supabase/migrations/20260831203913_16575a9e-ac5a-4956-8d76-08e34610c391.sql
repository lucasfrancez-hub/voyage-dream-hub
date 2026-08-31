DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'comprefacil-keepalive') THEN
    PERFORM cron.unschedule('comprefacil-keepalive');
  END IF;

  PERFORM cron.schedule(
    'comprefacil-keepalive',
    '7 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/comprefacil-keepalive',
      headers := '{"Content-Type":"application/json","apikey":"sb_publishable_ORdy5AQjrPReq3MPcnLDQQ_7iEblv-F"}'::jsonb,
      body := '{"margemMinutos":240}'::jsonb,
      timeout_milliseconds := 55000
    );
    $cron$
  );
END;
$$;