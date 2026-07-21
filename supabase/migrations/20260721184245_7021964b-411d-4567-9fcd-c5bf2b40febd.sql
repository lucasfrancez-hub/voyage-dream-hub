
CREATE TABLE public.protocol_verifications (
  hash TEXT PRIMARY KEY,
  protocolo_id UUID NOT NULL REFERENCES public.wa_protocolos(id) ON DELETE CASCADE,
  numero TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.protocol_verifications TO anon;
GRANT SELECT, INSERT ON public.protocol_verifications TO authenticated;
GRANT ALL ON public.protocol_verifications TO service_role;

ALTER TABLE public.protocol_verifications ENABLE ROW LEVEL SECURITY;

-- Público pode validar código (leitura)
CREATE POLICY "Anyone can validate a hash"
  ON public.protocol_verifications FOR SELECT
  TO anon, authenticated
  USING (true);

-- Só usuários autenticados (admin/atendentes) inserem no ato da geração
CREATE POLICY "Authenticated can register generated hashes"
  ON public.protocol_verifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_protocol_verifications_protocolo ON public.protocol_verifications(protocolo_id);
CREATE INDEX idx_protocol_verifications_generated_at ON public.protocol_verifications(generated_at DESC);
