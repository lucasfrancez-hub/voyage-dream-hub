ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Admins can upload boleto documents'
  ) THEN
    CREATE POLICY "Admins can upload boleto documents"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'boleto-documents' AND public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Admins can update boleto documents'
  ) THEN
    CREATE POLICY "Admins can update boleto documents"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'boleto-documents' AND public.has_role(auth.uid(), 'admin'))
      WITH CHECK (bucket_id = 'boleto-documents' AND public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;