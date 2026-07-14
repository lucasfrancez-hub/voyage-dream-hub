-- ============ WA CONVERSATIONS ============
CREATE TABLE public.wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone text NOT NULL UNIQUE,
  person_id uuid NULL REFERENCES public.people(id) ON DELETE SET NULL,
  display_name text NULL,
  mode text NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai','human','resolved')),
  assigned_to uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  identity_verified_at timestamptz NULL,
  identity_verified_cpf text NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text NULL,
  unread_count integer NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_conversations_last_message_idx ON public.wa_conversations (last_message_at DESC);
CREATE INDEX wa_conversations_mode_idx ON public.wa_conversations (mode);
CREATE INDEX wa_conversations_assigned_idx ON public.wa_conversations (assigned_to);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversations TO authenticated;
GRANT ALL ON public.wa_conversations TO service_role;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/partner can read conversations"
  ON public.wa_conversations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));
CREATE POLICY "Admin/partner can write conversations"
  ON public.wa_conversations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));

CREATE TRIGGER wa_conversations_updated_at
  BEFORE UPDATE ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ WA MESSAGES ============
CREATE TABLE public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender text NOT NULL CHECK (sender IN ('customer','camila','human','system')),
  content text NOT NULL,
  wa_message_id text NULL UNIQUE,
  media_url text NULL,
  media_type text NULL,
  tool_calls jsonb NULL,
  sender_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_messages_conversation_idx ON public.wa_messages (conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_messages TO authenticated;
GRANT ALL ON public.wa_messages TO service_role;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/partner can read messages"
  ON public.wa_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));
CREATE POLICY "Admin/partner can write messages"
  ON public.wa_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));

-- Realtime pro inbox interno
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations;

-- ============ HANDOFF EVENTS ============
CREATE TABLE public.wa_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  from_mode text NOT NULL,
  to_mode text NOT NULL,
  reason text NULL,
  briefing text NULL,
  actor uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_handoff_conversation_idx ON public.wa_handoff_events (conversation_id, created_at DESC);

GRANT SELECT, INSERT ON public.wa_handoff_events TO authenticated;
GRANT ALL ON public.wa_handoff_events TO service_role;
ALTER TABLE public.wa_handoff_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/partner can read handoffs"
  ON public.wa_handoff_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));
CREATE POLICY "Admin/partner can insert handoffs"
  ON public.wa_handoff_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));