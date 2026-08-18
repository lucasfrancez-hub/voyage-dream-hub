ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS cativa_pacote_id uuid;
CREATE INDEX IF NOT EXISTS packages_cativa_pacote_id_idx ON public.packages(cativa_pacote_id);

-- Vínculo retroativo: casa pacotes publicados da Cativa com o item do catálogo
UPDATE public.packages p
SET cativa_pacote_id = c.id
FROM public.cativa_pacotes c
WHERE p.cativa_pacote_id IS NULL
  AND coalesce(p.supplier_name,'') ILIKE '%Cativa%'
  AND p.going_date IS NOT NULL
  AND p.going_date = c.data_viagem
  AND p.return_date = c.data_fim
  AND lower(coalesce(p.destination,'')) = lower(coalesce(c.destino,''));

-- Reprocessamento automático das planilhas: 1x por dia (06h BRT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cativa-planilhas') THEN
    PERFORM cron.unschedule('cativa-planilhas');
  END IF;
END $$;

select cron.schedule('cativa-planilhas','0 9 * * *',$$
select net.http_post(
  url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af-dev.lovable.app/api/public/hooks/cativa-sync',
  headers := '{"Content-Type":"application/json","apikey":"sb_publishable_ORdy5AQjrPReq3MPcnLDQQ_7iEblv-F"}'::jsonb,
  body := '{"planilhas":true,"voos":false}'::jsonb,
  timeout_milliseconds := 55000);
$$);