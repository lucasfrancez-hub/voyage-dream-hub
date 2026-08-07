CREATE TABLE public.instagram_comment_ai_pauses (
  media_id text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_comment_ai_pauses TO authenticated;
GRANT ALL ON public.instagram_comment_ai_pauses TO service_role;
ALTER TABLE public.instagram_comment_ai_pauses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe gerencia pausas de IA de comentarios"
ON public.instagram_comment_ai_pauses FOR ALL TO authenticated
USING (true) WITH CHECK (true);