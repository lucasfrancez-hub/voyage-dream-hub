
-- =========================
-- order_passengers
-- =========================
CREATE TABLE public.order_passengers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  passenger_type TEXT NOT NULL DEFAULT 'ADT' CHECK (passenger_type IN ('ADT','CHD','INF')),
  birth_date DATE,
  cpf TEXT,
  document TEXT,
  ticket_number TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_passengers TO authenticated;
GRANT ALL ON public.order_passengers TO service_role;

ALTER TABLE public.order_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage passengers" ON public.order_passengers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers view own passengers" ON public.order_passengers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_passengers.order_id
      AND lower(o.email) = lower(auth.jwt() ->> 'email')
  ));

CREATE INDEX order_passengers_order_id_idx ON public.order_passengers(order_id);

CREATE TRIGGER order_passengers_set_updated_at
  BEFORE UPDATE ON public.order_passengers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- order_items
-- =========================
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('hotel','flight','other')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','pending')),
  title TEXT NOT NULL,
  supplier_locator TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage order items" ON public.order_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers view own order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND lower(o.email) = lower(auth.jwt() ->> 'email')
  ));

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX order_items_kind_status_idx ON public.order_items(kind, status);

CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- order_item_financials
-- =========================
CREATE TABLE public.order_item_financials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  supplier_name TEXT,
  sale_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 1,
  due_date DATE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_financials TO authenticated;
GRANT ALL ON public.order_item_financials TO service_role;

ALTER TABLE public.order_item_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage item financials" ON public.order_item_financials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers view own item financials" ON public.order_item_financials
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_financials.order_item_id
      AND lower(o.email) = lower(auth.jwt() ->> 'email')
  ));

CREATE INDEX order_item_financials_item_id_idx ON public.order_item_financials(order_item_id);

CREATE TRIGGER order_item_financials_set_updated_at
  BEFORE UPDATE ON public.order_item_financials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
