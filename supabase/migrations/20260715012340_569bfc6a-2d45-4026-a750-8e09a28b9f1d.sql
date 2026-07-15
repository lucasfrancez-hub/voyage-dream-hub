
CREATE TABLE public.flight_change_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  flight_number text NOT NULL,
  old_depart_at text,
  new_depart_at text,
  old_arrive_at text,
  new_arrive_at text,
  old_status text,
  new_status text,
  wa_phone text,
  wa_button_message_id text,
  response text CHECK (response IN ('accepted','rejected')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.flight_change_alerts TO authenticated;
GRANT ALL ON public.flight_change_alerts TO service_role;

ALTER TABLE public.flight_change_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alerts of orders they can see"
  ON public.flight_change_alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = flight_change_alerts.order_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.is_partner_order_owner(o.id)
        )
    )
  );

CREATE UNIQUE INDEX flight_change_alerts_item_new_depart_uidx
  ON public.flight_change_alerts(order_item_id, COALESCE(new_depart_at,''));

CREATE INDEX flight_change_alerts_order_idx
  ON public.flight_change_alerts(order_id);

CREATE TRIGGER trg_flight_change_alerts_updated_at
  BEFORE UPDATE ON public.flight_change_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Agenda cron a cada 2h chamando o endpoint público de verificação
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-flight-changes') THEN
    PERFORM cron.unschedule('check-flight-changes');
  END IF;

  PERFORM cron.schedule(
    'check-flight-changes',
    '0 */2 * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/check-flight-changes',
        headers := jsonb_build_object('Content-Type','application/json'),
        body := '{}'::jsonb
      );
    $cron$
  );
END $$;
