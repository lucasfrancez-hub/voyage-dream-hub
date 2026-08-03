CREATE TABLE public.instagram_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL,
  query_string text,
  source_ip text,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_body text,
  event_object text,
  event_type text,
  account_external_id text,
  conversation_external_id text,
  message_external_id text,
  sender_external_id text,
  validation_status text NOT NULL DEFAULT 'received',
  signature_received text,
  signature_calculated text,
  signature_valid boolean,
  verify_token_valid boolean,
  rejection_reason text,
  processing_status text NOT NULL DEFAULT 'received',
  processing_error text,
  response_status integer,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.instagram_webhook_logs TO authenticated;
GRANT ALL ON public.instagram_webhook_logs TO service_role;
ALTER TABLE public.instagram_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instagram_webhook_logs_admin_read" ON public.instagram_webhook_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX instagram_webhook_logs_received_idx ON public.instagram_webhook_logs(received_at DESC);
CREATE INDEX instagram_webhook_logs_message_idx ON public.instagram_webhook_logs(message_external_id) WHERE message_external_id IS NOT NULL;

CREATE TABLE public.instagram_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  operation text NOT NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  request_payload jsonb,
  response_body jsonb,
  response_raw text,
  http_status integer,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  error_code text,
  error_subcode text,
  fbtrace_id text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.instagram_api_logs TO authenticated;
GRANT ALL ON public.instagram_api_logs TO service_role;
ALTER TABLE public.instagram_api_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instagram_api_logs_admin_read" ON public.instagram_api_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX instagram_api_logs_created_idx ON public.instagram_api_logs(created_at DESC);
CREATE INDEX instagram_api_logs_account_idx ON public.instagram_api_logs(account_id, created_at DESC);

CREATE TABLE public.instagram_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  overall_status text NOT NULL,
  token_valid boolean,
  account_connected boolean,
  webhook_reachable boolean,
  signature_configured boolean,
  verify_token_configured boolean,
  subscribed boolean,
  subscribed_fields text[] NOT NULL DEFAULT '{}',
  messages_subscribed boolean,
  app_id text,
  ig_user_id text,
  connected_username text,
  callback_url text,
  http_status integer,
  last_webhook_at timestamptz,
  last_error text,
  error_code text,
  error_subcode text,
  fbtrace_id text,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.instagram_health_checks TO authenticated;
GRANT ALL ON public.instagram_health_checks TO service_role;
ALTER TABLE public.instagram_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instagram_health_checks_admin_read" ON public.instagram_health_checks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX instagram_health_checks_checked_idx ON public.instagram_health_checks(checked_at DESC);
CREATE INDEX instagram_health_checks_account_idx ON public.instagram_health_checks(account_id, checked_at DESC);