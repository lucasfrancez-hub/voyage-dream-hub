ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS ultima_quote_referenciada uuid,
  ADD COLUMN IF NOT EXISTS ultima_opcao_referenciada integer,
  ADD COLUMN IF NOT EXISTS ultima_referencia_at timestamptz;