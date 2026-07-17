ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payer_birth_date DATE;
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS card_expiry TEXT;