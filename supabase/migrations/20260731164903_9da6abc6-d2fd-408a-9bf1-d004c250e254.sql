CREATE TABLE IF NOT EXISTS public.ai_model_chain (
  id TEXT PRIMARY KEY,
  models JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_model_chain TO authenticated;
GRANT ALL ON public.ai_model_chain TO service_role;
ALTER TABLE public.ai_model_chain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ai_model_chain" ON public.ai_model_chain FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.ai_model_chain (id, models) VALUES (
  'whatsapp',
  '["openai/gpt-5.4-mini","openai/gpt-5.4-mini","openai/gpt-5.4","openai/gpt-5.4-nano","google/gemini-3.6-flash","google/gemini-3.1-flash-lite"]'::jsonb
) ON CONFLICT (id) DO NOTHING;