CREATE TABLE public.airfare_manual_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  origin_iata text NOT NULL,
  destination_iata text NOT NULL,
  departure_date date NOT NULL,
  return_date date,
  reference_price numeric,
  origin_city text,
  destination_city text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  detail text,
  error text,
  promotion_id uuid REFERENCES public.airfare_promotions(id) ON DELETE SET NULL,
  result jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.airfare_manual_queue TO authenticated;
GRANT ALL ON public.airfare_manual_queue TO service_role;

ALTER TABLE public.airfare_manual_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam fila manual de aereo"
ON public.airfare_manual_queue
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());

CREATE INDEX airfare_manual_queue_status_created_idx
ON public.airfare_manual_queue (status, created_at);

CREATE UNIQUE INDEX airfare_manual_queue_active_route_idx
ON public.airfare_manual_queue (
  origin_iata,
  destination_iata,
  departure_date,
  COALESCE(return_date, DATE '0001-01-01')
)
WHERE status IN ('queued','running');

CREATE TRIGGER airfare_manual_queue_touch
BEFORE UPDATE ON public.airfare_manual_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();