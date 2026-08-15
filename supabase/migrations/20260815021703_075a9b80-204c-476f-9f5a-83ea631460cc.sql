UPDATE public.wa_flight_quotes
SET delivery_status = 'cancelled', cancelled_at = COALESCE(cancelled_at, now()), next_run_at = NULL
WHERE delivery_status NOT IN ('completed','cancelled');

UPDATE public.wa_flight_quote_options
SET delivery_status = 'cancelled', next_run_at = NULL
WHERE delivery_status NOT IN ('delivered_card','delivered_text','cancelled');

DELETE FROM public.wa_flight_card_cache;