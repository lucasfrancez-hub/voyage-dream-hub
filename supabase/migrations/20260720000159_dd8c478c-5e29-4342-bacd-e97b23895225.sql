
-- Tabela de configuração da instância Evolution (só uma linha por enquanto)
CREATE TABLE public.wa_disparo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'disconnected', -- disconnected | connecting | connected
  connected_number text,
  last_qr_base64 text,
  last_qr_at timestamptz,
  last_status_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_disparo_config TO authenticated;
GRANT ALL ON public.wa_disparo_config TO service_role;
ALTER TABLE public.wa_disparo_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage disparo config" ON public.wa_disparo_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_wa_disparo_config_updated_at
  BEFORE UPDATE ON public.wa_disparo_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Templates de mensagem
CREATE TABLE public.wa_disparo_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_disparo_templates TO authenticated;
GRANT ALL ON public.wa_disparo_templates TO service_role;
ALTER TABLE public.wa_disparo_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage disparo templates" ON public.wa_disparo_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_wa_disparo_templates_updated_at
  BEFORE UPDATE ON public.wa_disparo_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Histórico de envios
CREATE TABLE public.wa_disparo_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number text NOT NULL,
  to_name text,
  message text NOT NULL,
  media_url text,
  media_filename text,
  media_kind text, -- image | document | audio | video
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  error_message text,
  provider_message_id text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  passenger_id uuid REFERENCES public.order_passengers(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.wa_disparo_templates(id) ON DELETE SET NULL,
  bulk_batch_id uuid,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_disparo_envios TO authenticated;
GRANT ALL ON public.wa_disparo_envios TO service_role;
ALTER TABLE public.wa_disparo_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage disparo envios" ON public.wa_disparo_envios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_wa_disparo_envios_created_at ON public.wa_disparo_envios(created_at DESC);
CREATE INDEX idx_wa_disparo_envios_order_id ON public.wa_disparo_envios(order_id);
CREATE INDEX idx_wa_disparo_envios_bulk ON public.wa_disparo_envios(bulk_batch_id);
