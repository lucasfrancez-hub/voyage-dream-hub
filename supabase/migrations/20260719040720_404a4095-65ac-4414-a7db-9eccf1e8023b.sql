-- Revoke EXECUTE on SECURITY DEFINER functions that should not be called directly by users.
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nfse_next_rps(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_set_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_sync_receivable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_seed_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_materialize() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_order_items_autolink_passengers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_order_passengers_autolink_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.materialize_order_from_snapshot(uuid) FROM PUBLIC, anon, authenticated;

-- has_role is used inside RLS policies (evaluated as the querying role): keep for authenticated only.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;

-- Customer-facing read policy for boleto-documents (mirrors order-documents pattern).
CREATE POLICY "Customers read own boleto documents"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'boleto-documents'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE (o.id)::text = (storage.foldername(storage.objects.name))[1]
        AND lower(o.email) = lower((auth.jwt() ->> 'email'))
    )
  );