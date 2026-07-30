ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS ai_instruction text,
  ADD COLUMN IF NOT EXISTS ai_instruction_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_instruction_by uuid;