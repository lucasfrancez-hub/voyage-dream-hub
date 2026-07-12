
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payer_full_name text,
  ADD COLUMN IF NOT EXISTS payer_cpf text,
  ADD COLUMN IF NOT EXISTS payer_email text,
  ADD COLUMN IF NOT EXISTS payer_phone text,
  ADD COLUMN IF NOT EXISTS payer_zip text,
  ADD COLUMN IF NOT EXISTS payer_address text,
  ADD COLUMN IF NOT EXISTS payer_number text,
  ADD COLUMN IF NOT EXISTS payer_district text,
  ADD COLUMN IF NOT EXISTS payer_city text,
  ADD COLUMN IF NOT EXISTS payer_state text;
