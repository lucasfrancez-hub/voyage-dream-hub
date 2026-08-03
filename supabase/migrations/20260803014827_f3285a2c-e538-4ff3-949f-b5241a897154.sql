CREATE TABLE public.wa_ai_switch (
  id text PRIMARY KEY DEFAULT 'global',
  ai_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT wa_ai_switch_singleton CHECK (id = 'global')
);

GRANT SELECT, INSERT, UPDATE ON public.wa_ai_switch TO authenticated;
GRANT ALL ON public.wa_ai_switch TO service_role;

ALTER TABLE public.wa_ai_switch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada le o interruptor da IA"
ON public.wa_ai_switch FOR SELECT TO authenticated USING (true);

CREATE POLICY "Equipe autenticada altera o interruptor da IA"
ON public.wa_ai_switch FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Equipe autenticada cria o interruptor da IA"
ON public.wa_ai_switch FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO public.wa_ai_switch (id, ai_enabled) VALUES ('global', true);