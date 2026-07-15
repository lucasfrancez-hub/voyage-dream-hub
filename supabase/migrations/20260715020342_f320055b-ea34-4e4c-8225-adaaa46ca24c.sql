CREATE POLICY "Admins atualizam protocolos"
  ON public.wa_protocolos
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));