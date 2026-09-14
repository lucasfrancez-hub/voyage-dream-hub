CREATE TABLE public.api_multicity_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id TEXT NOT NULL UNIQUE,
  api_client_id UUID NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  search_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.api_multicity_groups TO service_role;
GRANT SELECT ON public.api_multicity_groups TO authenticated;
ALTER TABLE public.api_multicity_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le grupos multitrecho" ON public.api_multicity_groups
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.api_multicity_group_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.api_multicity_groups(group_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  checkout_id TEXT,
  order_id TEXT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date DATE,
  amount NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'CREATED',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, sequence)
);

CREATE INDEX idx_mc_items_checkout ON public.api_multicity_group_items (checkout_id);
CREATE INDEX idx_mc_items_order ON public.api_multicity_group_items (order_id);

GRANT ALL ON public.api_multicity_group_items TO service_role;
GRANT SELECT ON public.api_multicity_group_items TO authenticated;
ALTER TABLE public.api_multicity_group_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le itens multitrecho" ON public.api_multicity_group_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_mc_groups_updated_at BEFORE UPDATE ON public.api_multicity_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mc_items_updated_at BEFORE UPDATE ON public.api_multicity_group_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();