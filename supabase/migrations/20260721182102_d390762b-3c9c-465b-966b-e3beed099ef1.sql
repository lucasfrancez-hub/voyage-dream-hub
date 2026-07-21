
CREATE TABLE public.package_ai_copy (
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','instagram')),
  text TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  PRIMARY KEY (package_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_ai_copy TO authenticated;
GRANT ALL ON public.package_ai_copy TO service_role;

ALTER TABLE public.package_ai_copy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage package ai copy"
ON public.package_ai_copy
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
