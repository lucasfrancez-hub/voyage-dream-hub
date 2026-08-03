CREATE TABLE public.wa_calendar_app_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  pin_hash text,
  nome text NOT NULL DEFAULT 'Agenda VIA AIR',
  ativo boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wa_calendar_app_links TO service_role;
ALTER TABLE public.wa_calendar_app_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app links admin" ON public.wa_calendar_app_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wa_calendar_push_subs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.wa_calendar_app_links(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  pref_lembrete boolean NOT NULL DEFAULT true,
  pref_resumo boolean NOT NULL DEFAULT true,
  pref_novo boolean NOT NULL DEFAULT true,
  minutos_antes integer NOT NULL DEFAULT 30,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wa_calendar_push_subs TO service_role;
ALTER TABLE public.wa_calendar_push_subs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push subs admin" ON public.wa_calendar_push_subs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wa_calendar_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wa_calendar_push_log TO service_role;
ALTER TABLE public.wa_calendar_push_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push log admin" ON public.wa_calendar_push_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_wa_cal_push_subs_link ON public.wa_calendar_push_subs(link_id);
CREATE INDEX idx_wa_cal_push_log_created ON public.wa_calendar_push_log(created_at);

CREATE TRIGGER trg_wa_calendar_app_links_updated BEFORE UPDATE ON public.wa_calendar_app_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_wa_calendar_push_subs_updated BEFORE UPDATE ON public.wa_calendar_push_subs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();