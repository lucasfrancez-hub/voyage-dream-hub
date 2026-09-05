CREATE TABLE IF NOT EXISTS public.wa_stickers_salvos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  filename text NOT NULL DEFAULT 'figurinha.webp',
  saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_stickers_salvos TO authenticated;
GRANT ALL ON public.wa_stickers_salvos TO service_role;

ALTER TABLE public.wa_stickers_salvos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe le figurinhas salvas"
  ON public.wa_stickers_salvos FOR SELECT TO authenticated USING (true);

CREATE POLICY "equipe salva figurinhas"
  ON public.wa_stickers_salvos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "equipe remove figurinhas"
  ON public.wa_stickers_salvos FOR DELETE TO authenticated USING (true);