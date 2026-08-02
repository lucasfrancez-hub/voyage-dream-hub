CREATE TABLE public.wa_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  webhook_field text,
  event_type text NOT NULL,
  meta_message_id text,
  wa_from text,
  conversation_id uuid,
  matched_message_id uuid,
  note text,
  payload jsonb
);

CREATE INDEX wa_webhook_events_received_idx ON public.wa_webhook_events (received_at DESC);
CREATE INDEX wa_webhook_events_type_idx ON public.wa_webhook_events (event_type);
CREATE INDEX wa_webhook_events_meta_id_idx ON public.wa_webhook_events (meta_message_id);

GRANT SELECT ON public.wa_webhook_events TO authenticated;
GRANT ALL ON public.wa_webhook_events TO service_role;

ALTER TABLE public.wa_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/partner can read webhook events"
ON public.wa_webhook_events FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));