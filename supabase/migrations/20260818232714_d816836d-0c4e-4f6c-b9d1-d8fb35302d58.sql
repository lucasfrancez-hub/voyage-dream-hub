CREATE TABLE IF NOT EXISTS public.wa_chat_push_dedup (
  chave text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_chat_push_dedup_created_idx ON public.wa_chat_push_dedup (created_at);
GRANT ALL ON public.wa_chat_push_dedup TO service_role;
ALTER TABLE public.wa_chat_push_dedup ENABLE ROW LEVEL SECURITY;