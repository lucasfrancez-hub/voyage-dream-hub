ALTER TABLE public.airfare_promotions ADD COLUMN IF NOT EXISTS card_overrides jsonb;

CREATE TABLE IF NOT EXISTS public.site_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  visitor_id text,
  event_type text not null,
  path text,
  title text,
  referrer text,
  referrer_host text,
  entry boolean not null default false,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  short_slug text,
  country text,
  region text,
  city text,
  device text,
  browser text,
  os text,
  duration_ms integer,
  target_label text,
  meta jsonb,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS site_events_created_idx ON public.site_events (created_at DESC);
CREATE INDEX IF NOT EXISTS site_events_session_idx ON public.site_events (session_id);
CREATE INDEX IF NOT EXISTS site_events_type_idx ON public.site_events (event_type);

GRANT SELECT ON public.site_events TO authenticated;
GRANT ALL ON public.site_events TO service_role;
ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read site events" ON public.site_events;
CREATE POLICY "admins read site events" ON public.site_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.short_link_clicks (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  referrer text,
  referrer_host text,
  country text,
  region text,
  city text,
  device text,
  browser text,
  os text,
  user_agent text,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS short_link_clicks_slug_idx ON public.short_link_clicks (slug, created_at DESC);

GRANT SELECT ON public.short_link_clicks TO authenticated;
GRANT ALL ON public.short_link_clicks TO service_role;
ALTER TABLE public.short_link_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read short link clicks" ON public.short_link_clicks;
CREATE POLICY "admins read short link clicks" ON public.short_link_clicks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));