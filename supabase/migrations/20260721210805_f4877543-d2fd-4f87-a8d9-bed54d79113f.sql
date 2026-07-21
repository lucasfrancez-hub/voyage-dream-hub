
-- Remover políticas antigas amplas
DROP POLICY IF EXISTS "Anyone can validate a hash" ON public.protocol_verifications;
DROP POLICY IF EXISTS "Authenticated can register generated hashes" ON public.protocol_verifications;
DROP POLICY IF EXISTS "Authenticated can update generated hashes" ON public.protocol_verifications;

-- Revogar SELECT direto (leitura só via função segura)
REVOKE SELECT ON public.protocol_verifications FROM anon;
REVOKE SELECT, INSERT ON public.protocol_verifications FROM authenticated;
GRANT INSERT, UPDATE ON public.protocol_verifications TO authenticated;

-- Só admins podem inserir/atualizar
CREATE POLICY "Admins can insert protocol verifications"
  ON public.protocol_verifications FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update protocol verifications"
  ON public.protocol_verifications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Função SECURITY DEFINER: valida hash e retorna somente o registro correspondente
CREATE OR REPLACE FUNCTION public.verify_protocol_hash(_hash TEXT)
RETURNS TABLE (
  numero TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  message_count INTEGER,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ,
  generated_by TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT numero, contact_name, contact_phone, message_count,
         opened_at, closed_at, generated_at, generated_by
  FROM public.protocol_verifications
  WHERE hash = lower(regexp_replace(coalesce(_hash, ''), '[^0-9a-f]', '', 'g'))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_protocol_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_protocol_hash(TEXT) TO anon, authenticated;
