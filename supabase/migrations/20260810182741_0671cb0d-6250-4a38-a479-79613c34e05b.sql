ALTER TABLE public.editair_assets ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.editair_assets ADD COLUMN IF NOT EXISTS thumb_path text;

CREATE TABLE IF NOT EXISTS public.editair_project_assets (
  project_id uuid NOT NULL REFERENCES public.editair_projects(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.editair_assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, asset_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.editair_project_assets TO authenticated;
GRANT ALL ON public.editair_project_assets TO service_role;

ALTER TABLE public.editair_project_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editair_project_assets_owner" ON public.editair_project_assets
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS editair_project_assets_asset_idx ON public.editair_project_assets(asset_id);
CREATE INDEX IF NOT EXISTS editair_assets_owner_idx ON public.editair_assets(owner_id, created_at DESC);