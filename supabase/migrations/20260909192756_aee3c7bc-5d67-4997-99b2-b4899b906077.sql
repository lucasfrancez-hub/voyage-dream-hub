-- ============ integration_orders ============
CREATE TABLE public.integration_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  viaair_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'oner',
  product_kind TEXT,
  offer_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_cart_id TEXT,
  provider_order_number TEXT,
  provider_sale_id TEXT,
  provider_booking_id TEXT,
  provider_status TEXT,
  state TEXT NOT NULL DEFAULT 'CART_CREATED',
  state_detail TEXT,
  amount NUMERIC(12,2),
  amount_provider NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  customer_name TEXT,
  customer_email TEXT,
  customer_payment_id TEXT,
  customer_payment_status TEXT,
  customer_payment_txid TEXT,
  provider_payment_id TEXT,
  provider_payment_status TEXT,
  provider_pix_brcode TEXT,
  provider_pix_payload JSONB,
  provider_pix_idempotency_key TEXT UNIQUE,
  locator TEXT,
  hotel_locator TEXT,
  sale_detail JSONB,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_poll_at TIMESTAMPTZ,
  poll_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_orders_provider_order_number_key
  ON public.integration_orders (provider, provider_order_number)
  WHERE provider_order_number IS NOT NULL;
CREATE INDEX integration_orders_state_idx ON public.integration_orders (state);
CREATE INDEX integration_orders_next_poll_idx ON public.integration_orders (next_poll_at)
  WHERE next_poll_at IS NOT NULL;
CREATE INDEX integration_orders_viaair_idx ON public.integration_orders (viaair_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_orders TO authenticated;
GRANT ALL ON public.integration_orders TO service_role;
ALTER TABLE public.integration_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe gerencia integracoes" ON public.integration_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

-- ============ integration_passengers ============
CREATE TABLE public.integration_passengers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_order_id UUID NOT NULL REFERENCES public.integration_orders(id) ON DELETE CASCADE,
  passenger_type TEXT NOT NULL DEFAULT 'ADT',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  document_number TEXT,
  document_type TEXT,
  birth_date DATE,
  gender TEXT,
  nationality TEXT,
  email TEXT,
  phone TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_passenger_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX integration_passengers_order_idx ON public.integration_passengers (integration_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_passengers TO authenticated;
GRANT ALL ON public.integration_passengers TO service_role;
ALTER TABLE public.integration_passengers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe gerencia passageiros integracao" ON public.integration_passengers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

-- ============ integration_tickets ============
CREATE TABLE public.integration_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_order_id UUID NOT NULL REFERENCES public.integration_orders(id) ON DELETE CASCADE,
  passenger_id UUID REFERENCES public.integration_passengers(id) ON DELETE SET NULL,
  passenger_name TEXT,
  ticket_number TEXT,
  pnr TEXT,
  airline TEXT,
  status TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_tickets_unique_number
  ON public.integration_tickets (integration_order_id, ticket_number)
  WHERE ticket_number IS NOT NULL;
CREATE INDEX integration_tickets_order_idx ON public.integration_tickets (integration_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_tickets TO authenticated;
GRANT ALL ON public.integration_tickets TO service_role;
ALTER TABLE public.integration_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe gerencia bilhetes integracao" ON public.integration_tickets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

-- ============ integration_events ============
CREATE TABLE public.integration_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_order_id UUID REFERENCES public.integration_orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'oner',
  event_type TEXT NOT NULL,
  state TEXT,
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX integration_events_order_idx ON public.integration_events (integration_order_id, created_at DESC);
GRANT SELECT, INSERT ON public.integration_events TO authenticated;
GRANT ALL ON public.integration_events TO service_role;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe le eventos integracao" ON public.integration_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

-- ============ oner_sessions ============
CREATE TABLE public.oner_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'oner',
  account_email TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  cookies_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  authenticated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX oner_sessions_lookup_idx ON public.oner_sessions (provider, account_email, status);
GRANT SELECT ON public.oner_sessions TO authenticated;
GRANT ALL ON public.oner_sessions TO service_role;
ALTER TABLE public.oner_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin le sessoes oner" ON public.oner_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ oner_otp_requests ============
CREATE TABLE public.oner_otp_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'oner',
  account_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  received_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  code_encrypted TEXT,
  source TEXT,
  sender TEXT,
  message_id TEXT,
  integration_order_id UUID REFERENCES public.integration_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX oner_otp_requests_status_idx ON public.oner_otp_requests (status, requested_at DESC);
CREATE UNIQUE INDEX oner_otp_requests_message_id_key ON public.oner_otp_requests (message_id)
  WHERE message_id IS NOT NULL;
GRANT SELECT ON public.oner_otp_requests TO authenticated;
GRANT ALL ON public.oner_otp_requests TO service_role;
ALTER TABLE public.oner_otp_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin le pedidos de codigo oner" ON public.oner_otp_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- triggers de updated_at
CREATE TRIGGER integration_orders_touch BEFORE UPDATE ON public.integration_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER integration_passengers_touch BEFORE UPDATE ON public.integration_passengers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER integration_tickets_touch BEFORE UPDATE ON public.integration_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER oner_sessions_touch BEFORE UPDATE ON public.oner_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER oner_otp_requests_touch BEFORE UPDATE ON public.oner_otp_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();