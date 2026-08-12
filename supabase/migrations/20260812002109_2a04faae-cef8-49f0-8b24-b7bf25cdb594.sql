CREATE POLICY "Admins manage comprovantes externos objects"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'comprovantes-externos' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'comprovantes-externos' AND public.has_role(auth.uid(), 'admin'));