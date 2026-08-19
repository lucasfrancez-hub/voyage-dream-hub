UPDATE public.airfare_promotions
SET archived_at = NULL,
    archived_reason = NULL,
    archived_cycle_day = NULL,
    fare_status = CASE WHEN fare_status = 'expirada' THEN 'valida' ELSE fare_status END,
    cycle_day = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    cycle_state = 'unchanged',
    cycle_changed_fields = '{}'::text[],
    cycle_state_at = NULL
WHERE archived_at IS NOT NULL
  AND status <> 'publicado'
  AND departure_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date;