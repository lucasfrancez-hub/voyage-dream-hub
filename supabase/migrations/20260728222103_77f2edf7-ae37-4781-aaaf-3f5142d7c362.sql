ALTER TABLE public.packages DROP CONSTRAINT IF EXISTS packages_kind_check;
ALTER TABLE public.packages ADD CONSTRAINT packages_kind_check CHECK (kind = ANY (ARRAY['package'::text,'service'::text,'cruise'::text,'tour'::text]));

CREATE TABLE IF NOT EXISTS public.package_date_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  date date NOT NULL,
  price_per_person numeric NOT NULL DEFAULT 0,
  taxes numeric NOT NULL DEFAULT 0,
  seats integer,
  is_available boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, date)
);

GRANT SELECT ON public.package_date_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_date_prices TO authenticated;
GRANT ALL ON public.package_date_prices TO service_role;

ALTER TABLE public.package_date_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view dates of active packages"
ON public.package_date_prices FOR SELECT
USING (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND p.is_active = true));

CREATE POLICY "Admins manage package dates"
ON public.package_date_prices FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS package_date_prices_pkg_date_idx ON public.package_date_prices (package_id, date);
CREATE INDEX IF NOT EXISTS package_date_prices_date_idx ON public.package_date_prices (date);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_package_date_prices_updated_at ON public.package_date_prices;
CREATE TRIGGER update_package_date_prices_updated_at
BEFORE UPDATE ON public.package_date_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();