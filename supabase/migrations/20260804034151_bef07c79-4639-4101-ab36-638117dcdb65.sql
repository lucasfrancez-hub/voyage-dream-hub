select cron.schedule(
  'instagram-collab-comments',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/instagram-collab-comments',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);