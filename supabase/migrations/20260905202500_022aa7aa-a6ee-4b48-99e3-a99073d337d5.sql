ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS profile_pic_url text;
ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS profile_pic_fetched_at timestamptz;