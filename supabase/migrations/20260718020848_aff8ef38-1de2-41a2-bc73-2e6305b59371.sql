CREATE POLICY "internal read people-attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'people-attachments' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user')));

CREATE POLICY "internal write people-attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'people-attachments' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user')));

CREATE POLICY "internal update people-attachments" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'people-attachments' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user')))
  WITH CHECK (bucket_id = 'people-attachments' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user')));

CREATE POLICY "internal delete people-attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'people-attachments' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user')));