CREATE TABLE public.wa_flight_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wa_flight_quotes TO authenticated;
GRANT ALL ON public.wa_flight_quotes TO service_role;
ALTER TABLE public.wa_flight_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe autenticada pode ver cotacoes de aereo"
ON public.wa_flight_quotes FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_wa_flight_quotes_conversation ON public.wa_flight_quotes (conversation_id, created_at DESC);