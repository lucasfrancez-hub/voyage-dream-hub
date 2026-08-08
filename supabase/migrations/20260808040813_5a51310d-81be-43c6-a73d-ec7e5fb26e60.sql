-- 1) airline_baggage_rules
DROP POLICY IF EXISTS "Equipe autenticada le regras de bagagem" ON public.airline_baggage_rules;
CREATE POLICY "Equipe autenticada le regras de bagagem"
ON public.airline_baggage_rules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));

-- 2) instagram_comment_ai_pauses
DROP POLICY IF EXISTS "Equipe gerencia pausas de IA de comentarios" ON public.instagram_comment_ai_pauses;
CREATE POLICY "Equipe gerencia pausas de IA de comentarios"
ON public.instagram_comment_ai_pauses FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'));

-- 3) wa_calendar_notification_jobs
DROP POLICY IF EXISTS "calendar jobs read" ON public.wa_calendar_notification_jobs;
CREATE POLICY "calendar jobs read"
ON public.wa_calendar_notification_jobs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 4) wa_flight_quotes
DROP POLICY IF EXISTS "Equipe autenticada pode ver cotacoes de aereo" ON public.wa_flight_quotes;
CREATE POLICY "Equipe autenticada pode ver cotacoes de aereo"
ON public.wa_flight_quotes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));

-- 5) wa_protocol_events
DROP POLICY IF EXISTS "staff reads protocol events" ON public.wa_protocol_events;
CREATE POLICY "staff reads protocol events"
ON public.wa_protocol_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'partner'));

-- 6) SECURITY DEFINER internas: só service_role
REVOKE EXECUTE ON FUNCTION public.claim_calendar_jobs(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_protocol_and_reset_runtime(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nfse_next_rps(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_protocol_hash(text) FROM anon, authenticated;

-- funções usadas pelo app autenticado: bloqueia apenas visitantes
REVOKE EXECUTE ON FUNCTION public.materialize_order_from_snapshot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_partner_order_owner(uuid) FROM anon;

-- gatilhos internos não devem ser chamados por API
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_order_items_autolink_passengers() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_order_passengers_autolink_items() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_materialize() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_seed_payment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_set_owner() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_sync_receivable() FROM anon, authenticated;