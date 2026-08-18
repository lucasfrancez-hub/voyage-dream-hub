SELECT cron.unschedule('instagram-dm-queue');
SELECT cron.schedule(
  'instagram-dm-queue',
  '15 seconds',
  $$
  SELECT net.http_post(
    url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/instagram-dm-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);