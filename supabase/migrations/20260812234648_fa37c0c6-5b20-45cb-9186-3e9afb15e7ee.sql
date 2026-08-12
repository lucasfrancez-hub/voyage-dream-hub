select cron.schedule(
  'airfare-promos-collect',
  '0 12,18 * * *',
  $$
  select net.http_post(
    url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/airfare-promos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);