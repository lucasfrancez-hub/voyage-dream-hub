
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS equipe text NOT NULL DEFAULT 'consultor';

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS central_slug text,
  ADD COLUMN IF NOT EXISTS central_desde timestamptz,
  ADD COLUMN IF NOT EXISTS central_brief jsonb,
  ADD COLUMN IF NOT EXISTS central_busca jsonb;

INSERT INTO public.ai_agents (slug, nome, system_prompt, horario_inicio, horario_fim, timezone, ativo, tools_habilitadas, equipe)
VALUES
  ('paula', 'Paula', '', '00:00:00', '00:00:00', 'America/Sao_Paulo', true, '[]'::jsonb, 'especialista'),
  ('bruno', 'Bruno', '', '00:00:00', '00:00:00', 'America/Sao_Paulo', true, '[]'::jsonb, 'especialista')
ON CONFLICT (slug) DO UPDATE SET equipe = 'especialista', ativo = true;
