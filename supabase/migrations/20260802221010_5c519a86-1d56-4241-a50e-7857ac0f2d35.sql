ALTER TABLE public.wa_flight_quotes ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
CREATE INDEX IF NOT EXISTS wa_messages_quote_option_idx ON public.wa_messages (quote_id, option_index);