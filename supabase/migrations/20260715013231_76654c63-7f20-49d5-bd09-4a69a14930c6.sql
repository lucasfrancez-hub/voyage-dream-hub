
ALTER TABLE public.flight_change_alerts
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS admin_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS flight_change_alerts_admin_seen_idx
  ON public.flight_change_alerts (admin_seen_at, created_at DESC);

DROP POLICY IF EXISTS "Admins can view all flight alerts" ON public.flight_change_alerts;
CREATE POLICY "Admins can view all flight alerts"
  ON public.flight_change_alerts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update flight alerts" ON public.flight_change_alerts;
CREATE POLICY "Admins can update flight alerts"
  ON public.flight_change_alerts
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
