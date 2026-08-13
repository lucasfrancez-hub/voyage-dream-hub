UPDATE public.airfare_promo_runs
SET status = 'done', phase = 'concluida', finished_at = now(),
    radar_note = 'Encerrada: fonte Melhores Destinos bloqueada (403/503) durante toda a execução. Nenhuma oportunidade nova; promoções válidas anteriores preservadas.'
WHERE status = 'running' AND started_at < now() - interval '15 minutes';