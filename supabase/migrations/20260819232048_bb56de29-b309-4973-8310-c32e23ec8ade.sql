ALTER TABLE public.instagram_comment_ai_pauses
  ADD COLUMN IF NOT EXISTS ai_instruction text,
  ADD COLUMN IF NOT EXISTS ai_instruction_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_instruction_by uuid;