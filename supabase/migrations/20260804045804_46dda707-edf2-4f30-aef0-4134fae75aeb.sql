ALTER TABLE public.wa_chat_push_subs
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_test_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_name text;

CREATE TABLE IF NOT EXISTS public.wa_agent_presence (
  user_id uuid PRIMARY KEY,
  conversation_id uuid,
  visivel boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_agent_presence TO authenticated;
GRANT ALL ON public.wa_agent_presence TO service_role;

ALTER TABLE public.wa_agent_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presence own rows" ON public.wa_agent_presence;
CREATE POLICY "presence own rows" ON public.wa_agent_presence
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wa_agent_presence_conv_idx ON public.wa_agent_presence (conversation_id, updated_at DESC);