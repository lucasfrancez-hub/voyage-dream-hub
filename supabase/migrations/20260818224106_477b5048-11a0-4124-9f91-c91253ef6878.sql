CREATE TABLE public.meta_ad_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  ig_user_id text,
  ig_media_id text NOT NULL,
  ig_permalink text,
  ig_caption text,
  ig_thumbnail text,
  social_post_id uuid REFERENCES public.social_scheduled_posts(id) ON DELETE SET NULL,
  ad_account_id text NOT NULL,
  page_id text,
  campaign_id text,
  adset_id text,
  ad_id text,
  creative_id text,
  objetivo text NOT NULL,
  budget_type text NOT NULL DEFAULT 'daily',
  budget_amount numeric NOT NULL,
  duration_days integer NOT NULL,
  total_budget numeric NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'criando',
  effective_status text,
  meta_error text,
  insights jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meta_ad_boosts_media_idx ON public.meta_ad_boosts (ig_media_id);
CREATE INDEX meta_ad_boosts_status_idx ON public.meta_ad_boosts (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_boosts TO authenticated;
GRANT ALL ON public.meta_ad_boosts TO service_role;

ALTER TABLE public.meta_ad_boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam impulsionamentos"
ON public.meta_ad_boosts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'));

CREATE TRIGGER meta_ad_boosts_touch BEFORE UPDATE ON public.meta_ad_boosts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();