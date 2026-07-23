-- ============ instagram_accounts ============
CREATE TABLE public.instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_user_id text NOT NULL UNIQUE,
  page_id text NOT NULL,
  username text NOT NULL,
  display_name text,
  profile_picture_url text,
  access_token text,
  token_expires_at timestamptz,
  webhook_verify_token text,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_accounts TO authenticated;
GRANT ALL ON public.instagram_accounts TO service_role;
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ig_accounts_admin_manage" ON public.instagram_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ig_accounts_staff_read" ON public.instagram_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_ig_accounts_updated_at BEFORE UPDATE ON public.instagram_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ instagram_conversations ============
CREATE TABLE public.instagram_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  ig_thread_id text,
  contact_ig_id text NOT NULL,
  contact_username text,
  contact_name text,
  contact_profile_pic text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_agent_slug text,
  funnel_stage text,
  archived_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, contact_ig_id)
);
CREATE INDEX ig_conv_account_last_msg_idx ON public.instagram_conversations(account_id, last_message_at DESC);
CREATE INDEX ig_conv_status_idx ON public.instagram_conversations(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_conversations TO authenticated;
GRANT ALL ON public.instagram_conversations TO service_role;
ALTER TABLE public.instagram_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ig_conv_staff_all" ON public.instagram_conversations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_ig_conv_updated_at BEFORE UPDATE ON public.instagram_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ instagram_messages ============
CREATE TABLE public.instagram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,
  ig_message_id text UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type text NOT NULL DEFAULT 'text',
  text text,
  attachment_url text,
  attachment_type text,
  reply_to_ig_message_id text,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_agent_slug text,
  status text NOT NULL DEFAULT 'received',
  error text,
  is_deleted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ig_msg_conv_created_idx ON public.instagram_messages(conversation_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_messages TO authenticated;
GRANT ALL ON public.instagram_messages TO service_role;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ig_msg_staff_all" ON public.instagram_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_ig_msg_updated_at BEFORE UPDATE ON public.instagram_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ instagram_comments ============
CREATE TABLE public.instagram_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  media_id text NOT NULL,
  media_permalink text,
  comment_id text NOT NULL UNIQUE,
  parent_comment_id text,
  from_ig_id text,
  from_username text,
  text text,
  auto_reply_status text NOT NULL DEFAULT 'pending',
  auto_reply_text text,
  auto_replied_at timestamptz,
  auto_dm_sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ig_comments_account_created_idx ON public.instagram_comments(account_id, created_at DESC);
CREATE INDEX ig_comments_media_idx ON public.instagram_comments(media_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_comments TO authenticated;
GRANT ALL ON public.instagram_comments TO service_role;
ALTER TABLE public.instagram_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ig_comments_staff_all" ON public.instagram_comments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_ig_comments_updated_at BEFORE UPDATE ON public.instagram_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ instagram_media ============
CREATE TABLE public.instagram_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  media_type text NOT NULL CHECK (media_type IN ('story_image','story_video','feed_image','feed_video','carousel','reel')),
  caption text,
  image_urls text[] NOT NULL DEFAULT '{}',
  video_url text,
  container_id text,
  ig_media_id text,
  permalink text,
  status text NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  published_at timestamptz,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ig_media_account_status_idx ON public.instagram_media(account_id, status, scheduled_for);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_media TO authenticated;
GRANT ALL ON public.instagram_media TO service_role;
ALTER TABLE public.instagram_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ig_media_staff_all" ON public.instagram_media FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_ig_media_updated_at BEFORE UPDATE ON public.instagram_media FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();