
CREATE POLICY "boarding_passes_staff_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'boarding-passes' AND (
      public.has_role(auth.uid(),'admin') OR
      public.has_role(auth.uid(),'user') OR
      EXISTS (
        SELECT 1 FROM public.flight_checkins fc
        WHERE fc.boarding_pass_path = storage.objects.name
          AND public.is_partner_order_owner(fc.order_id)
      )
    )
  );
