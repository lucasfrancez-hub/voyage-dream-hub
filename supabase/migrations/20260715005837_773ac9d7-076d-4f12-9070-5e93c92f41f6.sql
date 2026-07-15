
-- Sequence e função pra gerar número de protocolo (YYYYMMDD + 5 dígitos)
CREATE SEQUENCE IF NOT EXISTS public.wa_protocolo_seq;

CREATE OR REPLACE FUNCTION public.gerar_numero_protocolo()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n bigint;
  today text;
BEGIN
  n := nextval('public.wa_protocolo_seq');
  today := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD');
  RETURN today || lpad((n % 100000)::text, 5, '0');
END;
$$;

-- Tabela de protocolos
CREATE TABLE IF NOT EXISTS public.wa_protocolos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE DEFAULT public.gerar_numero_protocolo(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aberto',
  assunto_resumo text,
  funnel_stage_final text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_protocolos_conversation ON public.wa_protocolos(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_protocolos_status_activity ON public.wa_protocolos(status, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_wa_protocolos_opened ON public.wa_protocolos(opened_at DESC);

GRANT SELECT ON public.wa_protocolos TO authenticated;
GRANT ALL ON public.wa_protocolos TO service_role;

ALTER TABLE public.wa_protocolos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e partners veem protocolos"
  ON public.wa_protocolos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'));

CREATE POLICY "Service role gerencia protocolos"
  ON public.wa_protocolos FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_wa_protocolos_updated
  BEFORE UPDATE ON public.wa_protocolos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FK em wa_messages e wa_conversations
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS protocolo_id uuid REFERENCES public.wa_protocolos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_protocolo ON public.wa_messages(protocolo_id);

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS protocolo_ativo_id uuid REFERENCES public.wa_protocolos(id) ON DELETE SET NULL;
