
DROP POLICY IF EXISTS "Authenticated can register generated hashes" ON public.protocol_verifications;
CREATE POLICY "Authenticated can register generated hashes"
  ON public.protocol_verifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
