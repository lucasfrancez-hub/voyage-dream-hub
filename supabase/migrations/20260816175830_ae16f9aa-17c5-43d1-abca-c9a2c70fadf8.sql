ALTER TABLE public.airfare_promotions
  ADD COLUMN IF NOT EXISTS is_multi_leg boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS multi_leg_url text,
  ADD COLUMN IF NOT EXISTS multi_leg_savings numeric,
  ADD COLUMN IF NOT EXISTS inbound_search_key text,
  ADD COLUMN IF NOT EXISTS inbound_airline_iata text,
  ADD COLUMN IF NOT EXISTS inbound_airline_name text,
  ADD COLUMN IF NOT EXISTS inbound_airline_logo text;