GRANT INSERT ON public.orders TO anon, authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number() TO anon;