
CREATE POLICY "Admins acessam PDFs assinados" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'assinaturas' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'assinaturas' AND public.has_role(auth.uid(), 'admin'));
