CREATE TABLE public.chat_app_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  nome text NOT NULL DEFAULT 'Chat VIA AIR',
  user_id uuid NOT NULL,
  pin_hash text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.chat_app_links TO service_role;
ALTER TABLE public.chat_app_links ENABLE ROW LEVEL SECURITY;