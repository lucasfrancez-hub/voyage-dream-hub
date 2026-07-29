ALTER TABLE public.wa_broadcast_mensagens ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='broadcast_media_auth_write') THEN
    CREATE POLICY "broadcast_media_auth_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'broadcast-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='broadcast_media_auth_read') THEN
    CREATE POLICY "broadcast_media_auth_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'broadcast-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='broadcast_media_auth_update') THEN
    CREATE POLICY "broadcast_media_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'broadcast-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='broadcast_media_auth_delete') THEN
    CREATE POLICY "broadcast_media_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'broadcast-media');
  END IF;
END $$;