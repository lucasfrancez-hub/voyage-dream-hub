CREATE TABLE IF NOT EXISTS public.wa_chat_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  ativo boolean not null default true,
  pref_novas boolean not null default true,
  pref_instagram boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_chat_push_subs TO authenticated;
GRANT ALL ON public.wa_chat_push_subs TO service_role;

ALTER TABLE public.wa_chat_push_subs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own chat push subs" ON public.wa_chat_push_subs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wa_chat_push_subs_ativo_idx ON public.wa_chat_push_subs (ativo);