ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS quote_id uuid,
  ADD COLUMN IF NOT EXISTS option_index integer,
  ADD COLUMN IF NOT EXISTS meta_media_id text,
  ADD COLUMN IF NOT EXISTS source_tool text,
  ADD COLUMN IF NOT EXISTS agent_name text,
  ADD COLUMN IF NOT EXISTS card_option jsonb;

CREATE INDEX IF NOT EXISTS wa_messages_quote_idx ON public.wa_messages (quote_id, option_index);

ALTER TABLE public.wa_flight_quotes
  ADD COLUMN IF NOT EXISTS agent_slug text,
  ADD COLUMN IF NOT EXISTS agent_name text,
  ADD COLUMN IF NOT EXISTS filtros jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS escolha_option_index integer,
  ADD COLUMN IF NOT EXISTS escolha_at timestamptz;

CREATE INDEX IF NOT EXISTS wa_flight_quotes_conv_created_idx
  ON public.wa_flight_quotes (conversation_id, created_at DESC);