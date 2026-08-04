ALTER TABLE public.instagram_comments
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS from_profile_pic TEXT;
CREATE INDEX IF NOT EXISTS instagram_comments_read_idx ON public.instagram_comments (media_id, read_at);