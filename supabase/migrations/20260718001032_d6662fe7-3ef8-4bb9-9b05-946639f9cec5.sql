
-- 1) Remove insecure public INSERT policy on boleto-documents
DROP POLICY IF EXISTS "Anyone can upload boleto documents" ON storage.objects;

-- 2) Explicit deny-by-default policies (service_role only) for sensitive tables
DROP POLICY IF EXISTS "Service role only" ON public.flight_import_staging;
CREATE POLICY "Service role only" ON public.flight_import_staging
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role only" ON public.pending_authorization_signatures;
CREATE POLICY "Service role only" ON public.pending_authorization_signatures
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3) Admin visibility for email_send_state (read-only)
DROP POLICY IF EXISTS "Admins can read email send state" ON public.email_send_state;
CREATE POLICY "Admins can read email send state" ON public.email_send_state
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Lock down pgmq wrapper functions: set search_path and revoke public execute
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- Restrict has_role (SECURITY DEFINER) so only authenticated users may call it
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Restrict is_partner_order_owner similarly
REVOKE ALL ON FUNCTION public.is_partner_order_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_partner_order_owner(uuid) TO authenticated, service_role;

-- Non-user-callable helpers: restrict to service_role only
REVOKE ALL ON FUNCTION public.materialize_order_from_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_order_from_snapshot(uuid) TO service_role;
