CREATE POLICY "Admins manage order documents"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'order-documents' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'order-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own order documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'order-documents'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[1]
      AND lower(o.email) = lower(auth.jwt() ->> 'email')
  )
);