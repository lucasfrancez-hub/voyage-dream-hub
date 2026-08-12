-- 1) Markups do parcelamento estendido (fonte única e editável)
CREATE TABLE public.airfare_installment_markups (
  installments INTEGER PRIMARY KEY CHECK (installments BETWEEN 2 AND 24),
  markup_percent NUMERIC(6,4) NOT NULL CHECK (markup_percent >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.airfare_installment_markups TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.airfare_installment_markups TO authenticated;
GRANT ALL ON public.airfare_installment_markups TO service_role;
ALTER TABLE public.airfare_installment_markups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "markups_read_authenticated" ON public.airfare_installment_markups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "markups_write_admin" ON public.airfare_installment_markups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.airfare_installment_markups (installments, markup_percent) VALUES
  (5, 6.0800), (6, 7.1200), (7, 8.1600), (8, 9.2100),
  (9, 10.2600), (10, 11.3300), (11, 12.3900), (12, 19.9800);

-- 2) Rotas prioritárias da coleta automática
CREATE TABLE public.airfare_promo_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_iata TEXT NOT NULL,
  origin_city TEXT,
  destination_iata TEXT NOT NULL,
  destination_city TEXT,
  scope TEXT NOT NULL DEFAULT 'nacional' CHECK (scope IN ('nacional','internacional')),
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origin_iata, destination_iata)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.airfare_promo_routes TO authenticated;
GRANT ALL ON public.airfare_promo_routes TO service_role;
ALTER TABLE public.airfare_promo_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_routes_read_authenticated" ON public.airfare_promo_routes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "promo_routes_write_admin" ON public.airfare_promo_routes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.airfare_promo_routes (origin_iata, origin_city, destination_iata, destination_city, scope, priority) VALUES
  ('MGF','Maringá','GRU','São Paulo','nacional',10),
  ('MGF','Maringá','GIG','Rio de Janeiro','nacional',20),
  ('MGF','Maringá','SSA','Salvador','nacional',30),
  ('MGF','Maringá','REC','Recife','nacional',40),
  ('MGF','Maringá','MCZ','Maceió','nacional',50),
  ('MGF','Maringá','EZE','Buenos Aires','internacional',60),
  ('MGF','Maringá','SCL','Santiago','internacional',70),
  ('MGF','Maringá','MCO','Orlando','internacional',80),
  ('CWB','Curitiba','SSA','Salvador','nacional',90),
  ('CWB','Curitiba','EZE','Buenos Aires','internacional',100),
  ('LDB','Londrina','GRU','São Paulo','nacional',110),
  ('GRU','São Paulo','LIS','Lisboa','internacional',120),
  ('GRU','São Paulo','MCO','Orlando','internacional',130),
  ('GRU','São Paulo','SCL','Santiago','internacional',140);

-- 3) Promoções coletadas/curadas
CREATE TABLE public.airfare_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'nacional' CHECK (scope IN ('nacional','internacional')),
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','selecionado','publicado','descartado')),
  fare_status TEXT NOT NULL DEFAULT 'valida' CHECK (fare_status IN ('valida','desatualizada','expirada')),

  origin_iata TEXT NOT NULL,
  origin_city TEXT,
  destination_iata TEXT NOT NULL,
  destination_city TEXT,

  airline_iata TEXT,
  airline_name TEXT,
  airline_logo TEXT,

  departure_date DATE NOT NULL,
  return_date DATE,
  is_round_trip BOOLEAN NOT NULL DEFAULT true,
  stops INTEGER NOT NULL DEFAULT 0,
  has_checked_baggage BOOLEAN NOT NULL DEFAULT false,
  cabin_class TEXT,

  passengers INTEGER NOT NULL DEFAULT 1,
  fare_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxes NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL,
  price_per_passenger NUMERIC(12,2) NOT NULL,

  interest_free_installments INTEGER NOT NULL DEFAULT 1,
  interest_free_installment_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  airline_rule JSONB,

  extended_max_installments INTEGER,
  extended_installment_value_12x NUMERIC(12,2),
  extended_markup_12x NUMERIC(6,4),
  extended_total_12x NUMERIC(12,2),
  extended_options JSONB NOT NULL DEFAULT '[]'::jsonb,

  search_key TEXT,
  outbound_fare_id TEXT,
  outbound_itinerary_id TEXT,
  inbound_fare_id TEXT,
  inbound_itinerary_id TEXT,
  cart_url TEXT,
  short_url TEXT,
  raw JSONB,

  quoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX airfare_promotions_origin_idx ON public.airfare_promotions (origin_iata, departure_date);
CREATE INDEX airfare_promotions_status_idx ON public.airfare_promotions (status, scope);
CREATE INDEX airfare_promotions_quoted_idx ON public.airfare_promotions (quoted_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.airfare_promotions TO authenticated;
GRANT ALL ON public.airfare_promotions TO service_role;
ALTER TABLE public.airfare_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "airfare_promotions_read_authenticated" ON public.airfare_promotions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "airfare_promotions_write_admin" ON public.airfare_promotions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER airfare_promotions_touch
  BEFORE UPDATE ON public.airfare_promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();