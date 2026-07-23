
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS reply_to_wa_id text,
  ADD COLUMN IF NOT EXISTS reply_to_snippet text,
  ADD COLUMN IF NOT EXISTS reply_to_sender text;
CREATE INDEX IF NOT EXISTS idx_wa_messages_reply_to_wa_id ON public.wa_messages(reply_to_wa_id);
