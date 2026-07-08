
-- Fix search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Revoke public execute on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;

-- Tighten order insert policy with basic validation
DROP POLICY IF EXISTS "Anyone can create an order" ON public.orders;
CREATE POLICY "Anyone can create an order" ON public.orders
  FOR INSERT
  WITH CHECK (
    length(full_name) BETWEEN 2 AND 120
    AND length(email) BETWEEN 5 AND 160
    AND length(phone) BETWEEN 8 AND 30
    AND adults BETWEEN 1 AND 20
    AND total_price >= 0
  );
