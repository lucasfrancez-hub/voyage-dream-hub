ALTER TABLE public.wa_flight_quotes
  ADD COLUMN IF NOT EXISTS card_failed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS card_failed_reason text;

UPDATE public.ai_agents
   SET tools_habilitadas = '["pesquisar_passagens","encaminhar_para_comercial"]'::jsonb
 WHERE equipe = 'especialista';