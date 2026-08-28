CREATE OR REPLACE FUNCTION public.gerar_protocolo_visto()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  v := 'VA-' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD') || '-' ||
       lpad(floor(random() * 100000)::int::text, 5, '0');
  RETURN v;
END;
$$;

CREATE TABLE public.visa_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo text NOT NULL UNIQUE DEFAULT public.gerar_protocolo_visto(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(10), 'hex'),
  status text NOT NULL DEFAULT 'aguardando',
  applicant_name text,
  applicant_phone text,
  applicant_email text,
  applicant_cpf text,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visa_requests TO authenticated;
GRANT ALL ON public.visa_requests TO service_role;

ALTER TABLE public.visa_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe gerencia solicitacoes de visto"
ON public.visa_requests FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER visa_requests_updated_at
BEFORE UPDATE ON public.visa_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX visa_requests_created_at_idx ON public.visa_requests (created_at DESC);