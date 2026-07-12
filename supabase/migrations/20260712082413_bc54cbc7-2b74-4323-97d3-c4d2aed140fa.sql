REVOKE EXECUTE ON FUNCTION public.trg_orders_seed_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_card_brand(text) FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.detect_card_brand(text) SET search_path = public;