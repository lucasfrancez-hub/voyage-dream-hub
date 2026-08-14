ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS public_short_url text,
  ADD COLUMN IF NOT EXISTS public_quote_id text;