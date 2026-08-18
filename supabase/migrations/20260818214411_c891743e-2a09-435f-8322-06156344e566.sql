select cron.schedule(
  'airfare-promos-slots',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://pedidos.viaair.tur.br/api/public/hooks/airfare-promos-slot',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_ORdy5AQjrPReq3MPcnLDQQ_7iEblv-F"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 100000)
  from generate_series(1,4);
  $$
);