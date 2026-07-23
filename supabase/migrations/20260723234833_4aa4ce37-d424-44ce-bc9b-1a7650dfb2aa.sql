
CREATE TABLE public.broadcast_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE CASCADE,
  suggested_channels TEXT[] NOT NULL DEFAULT '{}',
  suggested_time TEXT,
  suggested_day TEXT,
  reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed')),
  campaign_id UUID REFERENCES public.wa_broadcast_campanhas(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_broadcast_suggestions_status ON public.broadcast_suggestions(status, created_at DESC);
CREATE INDEX idx_broadcast_suggestions_package ON public.broadcast_suggestions(package_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_suggestions TO authenticated;
GRANT ALL ON public.broadcast_suggestions TO service_role;

ALTER TABLE public.broadcast_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin/mkt gerencia sugestoes" ON public.broadcast_suggestions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'marketing'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'marketing'));

CREATE TRIGGER broadcast_suggestions_set_updated_at
  BEFORE UPDATE ON public.broadcast_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
