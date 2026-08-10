CREATE TABLE public.editair_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  format text NOT NULL DEFAULT 'vertical',
  width int NOT NULL DEFAULT 1080,
  height int NOT NULL DEFAULT 1920,
  fps int NOT NULL DEFAULT 30,
  instructions text,
  status text NOT NULL DEFAULT 'rascunho',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  transcript jsonb,
  stats jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.editair_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.editair_projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'video',
  name text NOT NULL,
  storage_path text NOT NULL,
  mime text,
  size_bytes bigint,
  duration_ms int,
  width int,
  height int,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.editair_ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.editair_projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor text NOT NULL DEFAULT 'ia',
  message text NOT NULL,
  ops jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX editair_assets_project_idx ON public.editair_assets(project_id);
CREATE INDEX editair_ai_events_project_idx ON public.editair_ai_events(project_id, created_at DESC);
CREATE INDEX editair_projects_owner_idx ON public.editair_projects(owner_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.editair_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.editair_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.editair_ai_events TO authenticated;
GRANT ALL ON public.editair_projects TO service_role;
GRANT ALL ON public.editair_assets TO service_role;
GRANT ALL ON public.editair_ai_events TO service_role;

ALTER TABLE public.editair_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editair_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editair_ai_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editair_projects_rw" ON public.editair_projects
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (owner_id = auth.uid() AND public.has_role(auth.uid(), 'marketing'))
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'))
  );

CREATE POLICY "editair_assets_rw" ON public.editair_assets
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (owner_id = auth.uid() AND public.has_role(auth.uid(), 'marketing'))
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'))
  );

CREATE POLICY "editair_ai_events_rw" ON public.editair_ai_events
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (owner_id = auth.uid() AND public.has_role(auth.uid(), 'marketing'))
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing'))
  );

CREATE TRIGGER editair_projects_updated_at
  BEFORE UPDATE ON public.editair_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();