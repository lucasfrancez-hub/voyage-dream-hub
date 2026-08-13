CREATE TABLE public.social_scheduled_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','instagram')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','enviando','publicado','falhou','cancelado')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  label TEXT,
  promo_id UUID,
  error TEXT,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX social_scheduled_posts_due_idx ON public.social_scheduled_posts (status, scheduled_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_scheduled_posts TO authenticated;
GRANT ALL ON public.social_scheduled_posts TO service_role;

ALTER TABLE public.social_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage scheduled social posts"
ON public.social_scheduled_posts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER social_scheduled_posts_updated_at
BEFORE UPDATE ON public.social_scheduled_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();