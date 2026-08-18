ALTER TABLE public.cativa_pacotes ADD COLUMN IF NOT EXISTS importado_em timestamptz;
CREATE INDEX IF NOT EXISTS cativa_pacotes_importado_em_idx ON public.cativa_pacotes (importado_em);