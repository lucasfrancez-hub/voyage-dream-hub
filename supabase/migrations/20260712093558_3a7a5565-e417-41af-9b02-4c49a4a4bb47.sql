
CREATE TABLE public.pedido_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  clicksign_document_key text UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','closed','refused','canceled')),
  deadline_at timestamptz,
  signed_pdf_url text,
  signed_pdf_path text,
  raw_last_event jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.pedido_assinaturas(pedido_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_assinaturas TO authenticated;
GRANT ALL ON public.pedido_assinaturas TO service_role;

ALTER TABLE public.pedido_assinaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam assinaturas" ON public.pedido_assinaturas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pedido_assinaturas_set_updated_at
  BEFORE UPDATE ON public.pedido_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.pedido_assinatura_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id uuid NOT NULL REFERENCES public.pedido_assinaturas(id) ON DELETE CASCADE,
  clicksign_signer_key text,
  clicksign_request_signature_key text,
  papel text NOT NULL CHECK (papel IN ('cliente','agencia','testemunha')),
  nome text NOT NULL,
  email text NOT NULL,
  cpf text,
  nascimento date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','refused')),
  signed_at timestamptz,
  refused_at timestamptz,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.pedido_assinatura_signers(assinatura_id);
CREATE INDEX ON public.pedido_assinatura_signers(clicksign_signer_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_assinatura_signers TO authenticated;
GRANT ALL ON public.pedido_assinatura_signers TO service_role;

ALTER TABLE public.pedido_assinatura_signers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam signers" ON public.pedido_assinatura_signers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pedido_assinatura_signers_set_updated_at
  BEFORE UPDATE ON public.pedido_assinatura_signers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
