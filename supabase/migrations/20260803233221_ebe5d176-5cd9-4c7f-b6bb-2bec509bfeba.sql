ALTER TABLE public.instagram_comments
  ADD COLUMN IF NOT EXISTS media_caption text,
  ADD COLUMN IF NOT EXISTS media_thumbnail text,
  ADD COLUMN IF NOT EXISTS media_type text;