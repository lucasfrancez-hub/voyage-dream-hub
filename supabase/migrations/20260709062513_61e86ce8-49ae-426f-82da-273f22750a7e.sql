CREATE POLICY "Customers view own orders by email"
ON public.orders
FOR SELECT
TO authenticated
USING (lower(email) = lower((auth.jwt() ->> 'email')));