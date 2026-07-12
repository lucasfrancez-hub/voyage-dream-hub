REVOKE EXECUTE ON FUNCTION public.trg_orders_seed_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_materialize() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.materialize_order_from_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;