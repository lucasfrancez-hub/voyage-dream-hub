select cron.unschedule('cativa-voos-fila');
select cron.schedule('cativa-voos-fila','* * * * *',$$
select net.http_post(
  url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af-dev.lovable.app/api/public/hooks/cativa-voos',
  headers := '{"Content-Type":"application/json","apikey":"sb_publishable_ORdy5AQjrPReq3MPcnLDQQ_7iEblv-F"}'::jsonb,
  body := '{"limite":6}'::jsonb,
  timeout_milliseconds := 55000)
from generate_series(1,5);
$$);
select cron.schedule('cativa-planilhas','*/30 * * * *',$$
select net.http_post(
  url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af-dev.lovable.app/api/public/hooks/cativa-sync',
  headers := '{"Content-Type":"application/json","apikey":"sb_publishable_ORdy5AQjrPReq3MPcnLDQQ_7iEblv-F"}'::jsonb,
  body := '{"planilhas":true,"voos":false}'::jsonb,
  timeout_milliseconds := 55000);
$$);
update public.cativa_import_runs set status='erro', erro='execução interrompida', finalizado_em=now()
where status='running' and iniciado_em < now() - interval '20 minutes';