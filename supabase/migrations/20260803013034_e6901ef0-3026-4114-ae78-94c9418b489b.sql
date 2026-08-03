CREATE TABLE public.wa_flight_card_cache (
  signature TEXT PRIMARY KEY,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  quote_id UUID,
  protocolo_id UUID,
  option_index INTEGER,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.wa_flight_card_cache TO service_role;

ALTER TABLE public.wa_flight_card_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX wa_flight_card_cache_created_idx ON public.wa_flight_card_cache (created_at DESC);
CREATE INDEX wa_flight_card_cache_quote_idx ON public.wa_flight_card_cache (quote_id);