select cron.schedule('cativa-voos-fallback','* * * * *',$$
select net.http_post(
  url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af-dev.lovable.app/api/public/hooks/cativa-sync',
  headers := '{"Content-Type":"application/json","apikey":"sb_publishable_ORdy5AQjrPReq3MPcnLDQQ_7iEblv-F"}'::jsonb,
  body := '{"planilhas":false,"voos":true,"limiteVoos":10}'::jsonb,
  timeout_milliseconds := 55000);
$$);