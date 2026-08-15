
-- ============ NAVIOS ============
CREATE TABLE public.ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line text NOT NULL DEFAULT '',
  name text NOT NULL,
  slug text GENERATED ALWAYS AS (lower(regexp_replace(coalesce(line,'')||'-'||name, '[^a-zA-Z0-9]+', '-', 'g'))) STORED,
  description text NOT NULL DEFAULT '',
  main_image_url text,
  technical_image_url text,
  specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ships_slug_key ON public.ships(slug);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ships TO authenticated;
GRANT ALL ON public.ships TO service_role;
ALTER TABLE public.ships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ships admin" ON public.ships FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ships_touch BEFORE UPDATE ON public.ships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ship_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_id uuid NOT NULL REFERENCES public.ships(id) ON DELETE CASCADE,
  media_type text NOT NULL DEFAULT 'image',
  context text NOT NULL DEFAULT 'gallery',
  source_url text NOT NULL,
  hires_url text,
  thumbnail_url text,
  embed_url text,
  provider text,
  title text,
  alt text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ship_media_unique ON public.ship_media(ship_id, source_url);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ship_media TO authenticated;
GRANT ALL ON public.ship_media TO service_role;
ALTER TABLE public.ship_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ship_media admin" ON public.ship_media FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ship_media_touch BEFORE UPDATE ON public.ship_media FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ship_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_id uuid NOT NULL REFERENCES public.ships(id) ON DELETE CASCADE,
  deck_label text NOT NULL,
  deck_number integer,
  image_url text,
  source_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ship_decks_unique ON public.ship_decks(ship_id, deck_label);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ship_decks TO authenticated;
GRANT ALL ON public.ship_decks TO service_role;
ALTER TABLE public.ship_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ship_decks admin" ON public.ship_decks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ship_decks_touch BEFORE UPDATE ON public.ship_decks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ship_attractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_id uuid NOT NULL REFERENCES public.ships(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'outros',
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  deck text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ship_attractions_unique ON public.ship_attractions(ship_id, category, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ship_attractions TO authenticated;
GRANT ALL ON public.ship_attractions TO service_role;
ALTER TABLE public.ship_attractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ship_attractions admin" ON public.ship_attractions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ship_attractions_touch BEFORE UPDATE ON public.ship_attractions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ship_cabins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_id uuid NOT NULL REFERENCES public.ships(id) ON DELETE CASCADE,
  cabin_type text NOT NULL DEFAULT 'interna',
  code text NOT NULL DEFAULT '',
  name text NOT NULL,
  capacity integer,
  size_m2 text,
  description text NOT NULL DEFAULT '',
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ship_cabins_unique ON public.ship_cabins(ship_id, cabin_type, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ship_cabins TO authenticated;
GRANT ALL ON public.ship_cabins TO service_role;
ALTER TABLE public.ship_cabins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ship_cabins admin" ON public.ship_cabins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ship_cabins_touch BEFORE UPDATE ON public.ship_cabins FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CRUZEIROS ============
CREATE SEQUENCE public.cruise_code_seq START 184;

CREATE TABLE public.cruises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT ('CRZ-' || lpad(nextval('public.cruise_code_seq')::text, 6, '0')),
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  name text NOT NULL,
  departure_date date,
  return_date date,
  nights integer,
  ship_id uuid REFERENCES public.ships(id) ON DELETE SET NULL,
  ship_name text NOT NULL DEFAULT '',
  operator text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'FRT_KROOZE',
  embark_port text,
  disembark_port text,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'rascunho',
  notes text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruises_code_key ON public.cruises(code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruises TO authenticated;
GRANT ALL ON public.cruises TO service_role;
ALTER TABLE public.cruises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruises admin" ON public.cruises FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruises_touch BEFORE UPDATE ON public.cruises FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_itineraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  day integer NOT NULL,
  date date,
  port text NOT NULL DEFAULT '',
  country text,
  arrival text,
  departure text,
  description text NOT NULL DEFAULT '',
  image_url text,
  activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  map_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_itineraries_unique ON public.cruise_itineraries(cruise_id, day);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_itineraries TO authenticated;
GRANT ALL ON public.cruise_itineraries TO service_role;
ALTER TABLE public.cruise_itineraries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_itineraries admin" ON public.cruise_itineraries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_itineraries_touch BEFORE UPDATE ON public.cruise_itineraries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_cabin_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  ship_cabin_id uuid REFERENCES public.ship_cabins(id) ON DELETE SET NULL,
  cabin_type text NOT NULL DEFAULT 'interna',
  name text NOT NULL,
  fare_name text NOT NULL DEFAULT '',
  category_codes text[] NOT NULL DEFAULT '{}',
  image_url text,
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  availability text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_cabin_offers_unique ON public.cruise_cabin_offers(cruise_id, cabin_type, name, fare_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_cabin_offers TO authenticated;
GRANT ALL ON public.cruise_cabin_offers TO service_role;
ALTER TABLE public.cruise_cabin_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_cabin_offers admin" ON public.cruise_cabin_offers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_cabin_offers_touch BEFORE UPDATE ON public.cruise_cabin_offers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.cruise_cabin_offers(id) ON DELETE CASCADE,
  cabin_category text NOT NULL DEFAULT '',
  fare text NOT NULL DEFAULT '',
  adults integer NOT NULL DEFAULT 0,
  young integer NOT NULL DEFAULT 0,
  children integer NOT NULL DEFAULT 0,
  infants integer NOT NULL DEFAULT 0,
  children_ages integer[] NOT NULL DEFAULT '{}',
  occupancy_key text NOT NULL DEFAULT '',
  base_amount numeric,
  taxes numeric,
  total numeric,
  currency text NOT NULL DEFAULT 'BRL',
  installments jsonb NOT NULL DEFAULT '{}'::jsonb,
  passenger_prices jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_current boolean NOT NULL DEFAULT true,
  snapshot_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cruise_prices_cruise_idx ON public.cruise_prices(cruise_id, offer_id, occupancy_key, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_prices TO authenticated;
GRANT ALL ON public.cruise_prices TO service_role;
ALTER TABLE public.cruise_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_prices admin" ON public.cruise_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_prices_touch BEFORE UPDATE ON public.cruise_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_additional_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_additional_categories_unique ON public.cruise_additional_categories(cruise_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_additional_categories TO authenticated;
GRANT ALL ON public.cruise_additional_categories TO service_role;
ALTER TABLE public.cruise_additional_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_additional_categories admin" ON public.cruise_additional_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_additional_categories_touch BEFORE UPDATE ON public.cruise_additional_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_additionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.cruise_additional_categories(id) ON DELETE SET NULL,
  category_name text NOT NULL DEFAULT '',
  code text NOT NULL DEFAULT '',
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_additionals_unique ON public.cruise_additionals(cruise_id, code, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_additionals TO authenticated;
GRANT ALL ON public.cruise_additionals TO service_role;
ALTER TABLE public.cruise_additionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_additionals admin" ON public.cruise_additionals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_additionals_touch BEFORE UPDATE ON public.cruise_additionals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_additional_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  additional_id uuid NOT NULL REFERENCES public.cruise_additionals(id) ON DELETE CASCADE,
  profile text NOT NULL DEFAULT 'adult',
  price numeric,
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_additional_prices_unique ON public.cruise_additional_prices(additional_id, profile);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_additional_prices TO authenticated;
GRANT ALL ON public.cruise_additional_prices TO service_role;
ALTER TABLE public.cruise_additional_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_additional_prices admin" ON public.cruise_additional_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_additional_prices_touch BEFORE UPDATE ON public.cruise_additional_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_insurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_per_person numeric,
  currency text NOT NULL DEFAULT 'BRL',
  coverage_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_insurances_unique ON public.cruise_insurances(cruise_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_insurances TO authenticated;
GRANT ALL ON public.cruise_insurances TO service_role;
ALTER TABLE public.cruise_insurances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_insurances admin" ON public.cruise_insurances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_insurances_touch BEFORE UPDATE ON public.cruise_insurances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  media_type text NOT NULL DEFAULT 'image',
  context text NOT NULL DEFAULT 'gallery',
  source_url text NOT NULL,
  hires_url text,
  thumbnail_url text,
  embed_url text,
  provider text,
  title text,
  alt text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_media_unique ON public.cruise_media(cruise_id, source_url);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_media TO authenticated;
GRANT ALL ON public.cruise_media TO service_role;
ALTER TABLE public.cruise_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_media admin" ON public.cruise_media FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_media_touch BEFORE UPDATE ON public.cruise_media FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ IMPORTAÇÃO ============
CREATE TABLE public.cruise_import_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'FRT_KROOZE',
  snapshots_count integer NOT NULL DEFAULT 0,
  last_capture_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_import_sessions_token_key ON public.cruise_import_sessions(token);
CREATE UNIQUE INDEX cruise_import_sessions_one_active ON public.cruise_import_sessions(user_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_import_sessions TO authenticated;
GRANT ALL ON public.cruise_import_sessions TO service_role;
ALTER TABLE public.cruise_import_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_import_sessions admin" ON public.cruise_import_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_import_sessions_touch BEFORE UPDATE ON public.cruise_import_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_import_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.cruise_import_sessions(id) ON DELETE SET NULL,
  cruise_id uuid NOT NULL REFERENCES public.cruises(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  seq integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'FRT_KROOZE',
  url text,
  page_type text NOT NULL DEFAULT 'desconhecido',
  detected jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'recebido',
  error text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cruise_import_snapshots_cruise_idx ON public.cruise_import_snapshots(cruise_id, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_import_snapshots TO authenticated;
GRANT ALL ON public.cruise_import_snapshots TO service_role;
ALTER TABLE public.cruise_import_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_import_snapshots admin" ON public.cruise_import_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_import_snapshots_touch BEFORE UPDATE ON public.cruise_import_snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cruise_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id uuid REFERENCES public.cruises(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.cruise_import_snapshots(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cruise_import_logs_cruise_idx ON public.cruise_import_logs(cruise_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_import_logs TO authenticated;
GRANT ALL ON public.cruise_import_logs TO service_role;
ALTER TABLE public.cruise_import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_import_logs admin" ON public.cruise_import_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.cruise_import_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  source text NOT NULL DEFAULT 'FRT_KROOZE',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruise_import_domains_unique ON public.cruise_import_domains(domain);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruise_import_domains TO authenticated;
GRANT ALL ON public.cruise_import_domains TO service_role;
ALTER TABLE public.cruise_import_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cruise_import_domains admin" ON public.cruise_import_domains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cruise_import_domains_touch BEFORE UPDATE ON public.cruise_import_domains FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.cruise_import_domains (domain, source) VALUES
  ('frtoperadora.krooze.com.br', 'FRT_KROOZE'),
  ('krooze.com.br', 'FRT_KROOZE');
