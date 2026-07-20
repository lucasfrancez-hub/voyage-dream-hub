DROP POLICY "Anyone can view active packages" ON public.packages;
CREATE POLICY "Public can view active packages" ON public.packages FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Admins can view all packages" ON public.packages FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));