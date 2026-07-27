
CREATE TABLE public.frt_credentials (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  cookie TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frt_credentials TO authenticated;
GRANT ALL ON public.frt_credentials TO service_role;

ALTER TABLE public.frt_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage frt credentials"
  ON public.frt_credentials FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
