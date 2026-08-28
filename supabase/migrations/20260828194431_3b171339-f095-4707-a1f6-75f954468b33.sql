REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

ALTER POLICY "Partners delete own orders" ON public.orders TO authenticated;
ALTER POLICY "Partners update own orders" ON public.orders TO authenticated;
ALTER POLICY "Partners view own orders" ON public.orders TO authenticated;
ALTER POLICY "Anyone can create an order" ON public.orders TO anon, authenticated;