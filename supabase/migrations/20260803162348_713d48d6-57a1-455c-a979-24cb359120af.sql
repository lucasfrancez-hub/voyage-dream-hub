CREATE TABLE IF NOT EXISTS public.wa_flight_search_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  protocol_id uuid,
  agent_slug text,
  status text NOT NULL DEFAULT 'collecting',
  origin text,
  origin_status text NOT NULL DEFAULT 'missing',
  destination text,
  destination_airport text,
  departure_date date,
  return_date date,
  trip_type text,
  adults integer,
  children integer,
  infants integer,
  baggage_filter boolean,
  direct_flight_filter boolean,
  max_connections integer,
  included_airlines text[],
  excluded_airlines text[],
  departure_time_preference text,
  return_time_preference text,
  pending_question text,
  pending_question_message_id text,
  pending_question_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_customer_message_id text,
  last_processed_message_id text,
  active_quote_id uuid,
  last_referenced_quote_id uuid,
  last_referenced_option_index integer,
  wait_message_sent_at timestamptz,
  last_progress_at timestamptz NOT NULL DEFAULT now(),
  next_action text,
  failure_reason text,
  customer_nudge_count integer NOT NULL DEFAULT 0,
  recovery_priority text NOT NULL DEFAULT 'normal',
  recovery_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flight_search_requests TO authenticated;
GRANT ALL ON public.wa_flight_search_requests TO service_role;

ALTER TABLE public.wa_flight_search_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada gerencia solicitacoes aereas"
ON public.wa_flight_search_requests
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS wa_fsr_ativa_idx
  ON public.wa_flight_search_requests (protocol_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_fsr_conv_idx
  ON public.wa_flight_search_requests (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_fsr_progress_idx
  ON public.wa_flight_search_requests (status, last_progress_at);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_wa_flight_search_requests_updated_at ON public.wa_flight_search_requests;
CREATE TRIGGER update_wa_flight_search_requests_updated_at
BEFORE UPDATE ON public.wa_flight_search_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();