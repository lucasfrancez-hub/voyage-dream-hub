ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS trip_title text,
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS seller_email text,
  ADD COLUMN IF NOT EXISTS seller_phone text,
  ADD COLUMN IF NOT EXISTS supplier_logo_url text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;