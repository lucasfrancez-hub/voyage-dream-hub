SELECT cron.schedule(
  'instagram-health-check',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/instagram-health',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);