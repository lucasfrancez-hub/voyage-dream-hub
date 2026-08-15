ALTER TABLE public.wa_messages DROP CONSTRAINT IF EXISTS wa_messages_sender_check;
ALTER TABLE public.wa_messages ADD CONSTRAINT wa_messages_sender_check
  CHECK (sender IS NOT NULL AND char_length(sender) BETWEEN 1 AND 40 AND sender ~ '^[a-z0-9_-]+$');