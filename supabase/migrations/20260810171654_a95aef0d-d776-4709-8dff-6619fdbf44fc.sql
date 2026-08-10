CREATE POLICY "editair_media_rw" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'editair-media'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (auth.uid()::text = (storage.foldername(name))[1])
    )
  )
  WITH CHECK (
    bucket_id = 'editair-media'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (auth.uid()::text = (storage.foldername(name))[1])
    )
  );