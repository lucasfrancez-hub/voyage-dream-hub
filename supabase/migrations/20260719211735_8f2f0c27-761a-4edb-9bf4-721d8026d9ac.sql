
CREATE TABLE public.flight_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  passenger_id uuid REFERENCES public.order_passengers(id) ON DELETE SET NULL,
  cia text NOT NULL CHECK (cia IN ('LATAM','GOL','AZUL')),
  locator text NOT NULL,
  pnr_surname text,
  flight_number text,
  departure_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','running','success','failed','skipped')),
  attempts int NOT NULL DEFAULT 0,
  boarding_pass_path text,
  boarding_pass_url text,
  error text,
  scheduled_for timestamptz,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  delivered_wa_at timestamptz,
  delivered_email_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, passenger_id)
);

CREATE INDEX flight_checkins_status_idx ON public.flight_checkins(status, scheduled_for);
CREATE INDEX flight_checkins_order_idx ON public.flight_checkins(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flight_checkins TO authenticated;
GRANT ALL ON public.flight_checkins TO service_role;

ALTER TABLE public.flight_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_staff_read_all_checkins" ON public.flight_checkins
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user') OR public.is_partner_order_owner(order_id));

CREATE POLICY "admin_staff_write_checkins" ON public.flight_checkins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));

CREATE TRIGGER flight_checkins_set_updated_at
  BEFORE UPDATE ON public.flight_checkins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
