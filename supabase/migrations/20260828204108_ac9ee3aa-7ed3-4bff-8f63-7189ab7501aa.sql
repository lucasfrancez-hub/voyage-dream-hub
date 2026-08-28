CREATE SEQUENCE IF NOT EXISTS public.passport_protocol_seq;

CREATE OR REPLACE FUNCTION public.gerar_protocolo_passaporte()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE n bigint; d text;
BEGIN
  n := nextval('public.passport_protocol_seq');
  d := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD');
  RETURN 'PP-' || d || '-' || lpad((n % 100000)::text, 5, '0');
END;
$$;

CREATE TABLE public.passport_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo text NOT NULL DEFAULT public.gerar_protocolo_passaporte(),
  token text NOT NULL DEFAULT encode(gen_random_bytes(9), 'hex'),
  status text NOT NULL DEFAULT 'novo',
  service_type text NOT NULL DEFAULT 'renovacao',
  pf_protocolo text,
  pf_protocolo_at timestamptz,
  pf_notes text,
  applicant_name text,
  applicant_cpf text,
  applicant_email text,
  applicant_phone text,
  dados_pessoais jsonb NOT NULL DEFAULT '{}'::jsonb,
  documentos jsonb NOT NULL DEFAULT '{}'::jsonb,
  complementares jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_method text,
  amount numeric(12,2),
  installments integer,
  payment_status text NOT NULL DEFAULT 'pending',
  asaas_payment_id text,
  invoice_url text,
  pix_payload text,
  pix_qr_base64 text,
  submitted_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT passport_requests_token_key UNIQUE (token),
  CONSTRAINT passport_requests_protocolo_key UNIQUE (protocolo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passport_requests TO authenticated;
GRANT ALL ON public.passport_requests TO service_role;

ALTER TABLE public.passport_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe gerencia solicitacoes de passaporte"
ON public.passport_requests FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER passport_requests_set_updated_at
BEFORE UPDATE ON public.passport_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX passport_requests_created_idx ON public.passport_requests (created_at DESC);