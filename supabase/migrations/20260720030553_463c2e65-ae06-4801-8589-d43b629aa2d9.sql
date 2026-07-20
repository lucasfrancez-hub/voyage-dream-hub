
CREATE TABLE IF NOT EXISTS public.checkin_training_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airline text NOT NULL CHECK (airline IN ('LATAM','GOL','AZUL')),
  name text NOT NULL,
  initial_url text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  viewport_width int NOT NULL DEFAULT 1280,
  viewport_height int NOT NULL DEFAULT 900,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkin_training_scripts TO authenticated;
GRANT ALL ON public.checkin_training_scripts TO service_role;

ALTER TABLE public.checkin_training_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage training scripts"
  ON public.checkin_training_scripts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS checkin_training_scripts_airline_idx
  ON public.checkin_training_scripts (airline, updated_at DESC);

CREATE OR REPLACE FUNCTION public.tg_checkin_training_scripts_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_checkin_training_scripts_touch
  BEFORE UPDATE ON public.checkin_training_scripts
  FOR EACH ROW EXECUTE FUNCTION public.tg_checkin_training_scripts_touch();
