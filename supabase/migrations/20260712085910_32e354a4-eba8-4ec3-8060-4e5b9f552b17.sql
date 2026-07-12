
CREATE TABLE public.order_item_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES public.order_passengers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id, passenger_id)
);

CREATE INDEX idx_oip_order ON public.order_item_passengers(order_id);
CREATE INDEX idx_oip_item ON public.order_item_passengers(order_item_id);
CREATE INDEX idx_oip_pax ON public.order_item_passengers(passenger_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_passengers TO authenticated;
GRANT ALL ON public.order_item_passengers TO service_role;

ALTER TABLE public.order_item_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all order_item_passengers"
  ON public.order_item_passengers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.order_item_passengers (order_id, order_item_id, passenger_id)
SELECT i.order_id, i.id, p.id
FROM public.order_items i
JOIN public.order_passengers p ON p.order_id = i.order_id
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_order_items_autolink_passengers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_item_passengers (order_id, order_item_id, passenger_id)
  SELECT NEW.order_id, NEW.id, p.id
  FROM public.order_passengers p
  WHERE p.order_id = NEW.order_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_items_autolink_passengers
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_order_items_autolink_passengers();

CREATE OR REPLACE FUNCTION public.trg_order_passengers_autolink_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_item_passengers (order_id, order_item_id, passenger_id)
  SELECT NEW.order_id, i.id, NEW.id
  FROM public.order_items i
  WHERE i.order_id = NEW.order_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_passengers_autolink_items
AFTER INSERT ON public.order_passengers
FOR EACH ROW EXECUTE FUNCTION public.trg_order_passengers_autolink_items();
