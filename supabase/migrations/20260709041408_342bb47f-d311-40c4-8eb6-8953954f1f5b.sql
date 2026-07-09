
-- Anon (checkout público) pode enviar documentos ao bucket boleto-documents
CREATE POLICY "Anyone can upload boleto documents"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'boleto-documents');

-- Admins podem visualizar e excluir documentos
CREATE POLICY "Admins can read boleto documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'boleto-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete boleto documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'boleto-documents' AND has_role(auth.uid(), 'admin'::app_role));
