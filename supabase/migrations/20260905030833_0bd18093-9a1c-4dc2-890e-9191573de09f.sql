select cron.schedule(
  'uaz-sync-safety-net',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://pedidos.viaair.tur.br/api/public/hooks/uaz-sync-history?auto=1',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);