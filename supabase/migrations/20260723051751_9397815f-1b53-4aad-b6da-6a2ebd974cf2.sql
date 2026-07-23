-- Marca conversas de grupo
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false;

-- ============================================================
-- Destinos (canais/grupos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_broadcast_destinos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jid text NOT NULL UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('channel','group')),
  nome text NOT NULL,
  foto_url text,
  participantes int,
  is_admin boolean NOT NULL DEFAULT false,
  pode_postar boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  ultima_sync timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_destinos_tipo ON public.wa_broadcast_destinos(tipo);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_destinos_tags ON public.wa_broadcast_destinos USING gin(tags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_broadcast_destinos TO authenticated;
GRANT ALL ON public.wa_broadcast_destinos TO service_role;
ALTER TABLE public.wa_broadcast_destinos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin/mkt gerencia destinos" ON public.wa_broadcast_destinos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_wa_broadcast_destinos_updated
  BEFORE UPDATE ON public.wa_broadcast_destinos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Campanhas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_broadcast_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','agendada','enviando','concluida','falhou','cancelada')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  destino_ids uuid[] NOT NULL DEFAULT '{}',
  observacoes_marketing text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_campanhas_status ON public.wa_broadcast_campanhas(status);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_campanhas_scheduled
  ON public.wa_broadcast_campanhas(scheduled_at) WHERE status = 'agendada';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_broadcast_campanhas TO authenticated;
GRANT ALL ON public.wa_broadcast_campanhas TO service_role;
ALTER TABLE public.wa_broadcast_campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin/mkt gerencia campanhas" ON public.wa_broadcast_campanhas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_wa_broadcast_campanhas_updated
  BEFORE UPDATE ON public.wa_broadcast_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Mensagens (blocos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_broadcast_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.wa_broadcast_campanhas(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  tipo text NOT NULL CHECK (tipo IN ('text','image','video','document','buttons')),
  texto text,
  midia_url text,
  midia_filename text,
  midia_caption text,
  botoes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_mensagens_campanha
  ON public.wa_broadcast_mensagens(campanha_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_broadcast_mensagens TO authenticated;
GRANT ALL ON public.wa_broadcast_mensagens TO service_role;
ALTER TABLE public.wa_broadcast_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin/mkt gerencia mensagens" ON public.wa_broadcast_mensagens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_wa_broadcast_mensagens_updated
  BEFORE UPDATE ON public.wa_broadcast_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Envios (destino × mensagem)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_broadcast_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.wa_broadcast_campanhas(id) ON DELETE CASCADE,
  destino_id uuid NOT NULL REFERENCES public.wa_broadcast_destinos(id) ON DELETE CASCADE,
  mensagem_id uuid NOT NULL REFERENCES public.wa_broadcast_mensagens(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviado','entregue','lido','falhou')),
  wa_message_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, destino_id, mensagem_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_envios_campanha_status
  ON public.wa_broadcast_envios(campanha_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_envios_wa_msg
  ON public.wa_broadcast_envios(wa_message_id) WHERE wa_message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_broadcast_envios TO authenticated;
GRANT ALL ON public.wa_broadcast_envios TO service_role;
ALTER TABLE public.wa_broadcast_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin/mkt vê envios" ON public.wa_broadcast_envios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'));
CREATE TRIGGER trg_wa_broadcast_envios_updated
  BEFORE UPDATE ON public.wa_broadcast_envios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();