CREATE TABLE public.catalog_operators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  portal TEXT NOT NULL DEFAULT 'infotravel',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_operators TO authenticated;
GRANT ALL ON public.catalog_operators TO service_role;
ALTER TABLE public.catalog_operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_operators" ON public.catalog_operators
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID REFERENCES public.catalog_operators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subcategory TEXT,
  external_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operator_id, name, subcategory)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_categories TO authenticated;
GRANT ALL ON public.catalog_categories TO service_role;
ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_categories" ON public.catalog_categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_destinations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT,
  external_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, city, country)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_destinations TO authenticated;
GRANT ALL ON public.catalog_destinations TO service_role;
ALTER TABLE public.catalog_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_destinations" ON public.catalog_destinations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES public.catalog_operators(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.catalog_categories(id) ON DELETE SET NULL,
  destination_id UUID REFERENCES public.catalog_destinations(id) ON DELETE SET NULL,
  external_code TEXT NOT NULL,
  internal_code TEXT,
  fingerprint TEXT,
  name TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  summary TEXT,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_type TEXT,
  duration TEXT,
  language TEXT,
  schedules JSONB NOT NULL DEFAULT '[]'::jsonb,
  available_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  departure_place TEXT,
  return_place TEXT,
  meeting_point TEXT,
  cancellation_policy TEXT,
  change_policy TEXT,
  important_info TEXT,
  notes TEXT,
  requirements TEXT,
  includes JSONB NOT NULL DEFAULT '[]'::jsonb,
  not_includes JSONB NOT NULL DEFAULT '[]'::jsonb,
  supplier TEXT,
  currency TEXT,
  price NUMERIC,
  destination_label TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  product_url TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ativo',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operator_id, external_code)
);
CREATE INDEX idx_catalog_products_status ON public.catalog_products(status);
CREATE INDEX idx_catalog_products_dest ON public.catalog_products(destination_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_products TO authenticated;
GRANT ALL ON public.catalog_products TO service_role;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_products" ON public.catalog_products
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_product_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_product_images TO authenticated;
GRANT ALL ON public.catalog_product_images TO service_role;
ALTER TABLE public.catalog_product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_product_images" ON public.catalog_product_images
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_availabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_availabilities TO authenticated;
GRANT ALL ON public.catalog_availabilities TO service_role;
ALTER TABLE public.catalog_availabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_availabilities" ON public.catalog_availabilities
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  availability_id UUID REFERENCES public.catalog_availabilities(id) ON DELETE CASCADE,
  label TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL',
  amount NUMERIC,
  rate_type TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_rates TO authenticated;
GRANT ALL ON public.catalog_rates TO service_role;
ALTER TABLE public.catalog_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_rates" ON public.catalog_rates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_import_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_slug TEXT,
  destination TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_found INTEGER NOT NULL DEFAULT 0,
  total_new INTEGER NOT NULL DEFAULT 0,
  total_updated INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_import_runs TO authenticated;
GRANT ALL ON public.catalog_import_runs TO service_role;
ALTER TABLE public.catalog_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_import_runs" ON public.catalog_import_runs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.catalog_import_runs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_import_logs_run ON public.catalog_import_logs(run_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_import_logs TO authenticated;
GRANT ALL ON public.catalog_import_logs TO service_role;
ALTER TABLE public.catalog_import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_import_logs" ON public.catalog_import_logs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.catalog_product_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.catalog_import_runs(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL DEFAULT 'update',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_product_history_product ON public.catalog_product_history(product_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_product_history TO authenticated;
GRANT ALL ON public.catalog_product_history TO service_role;
ALTER TABLE public.catalog_product_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage catalog_product_history" ON public.catalog_product_history
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_catalog_operators_upd BEFORE UPDATE ON public.catalog_operators FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalog_categories_upd BEFORE UPDATE ON public.catalog_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalog_destinations_upd BEFORE UPDATE ON public.catalog_destinations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalog_products_upd BEFORE UPDATE ON public.catalog_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalog_product_images_upd BEFORE UPDATE ON public.catalog_product_images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalog_availabilities_upd BEFORE UPDATE ON public.catalog_availabilities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalog_rates_upd BEFORE UPDATE ON public.catalog_rates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalog_import_runs_upd BEFORE UPDATE ON public.catalog_import_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.catalog_operators (slug, name, portal) VALUES
  ('infotravel-frt', 'FRT Operadora (Infotravel)', 'infotravel'),
  ('infotravel-cativa', 'Cativa (Infotravel)', 'infotravel'),
  ('infotravel-generico', 'Infotravel - outras operadoras', 'infotravel');