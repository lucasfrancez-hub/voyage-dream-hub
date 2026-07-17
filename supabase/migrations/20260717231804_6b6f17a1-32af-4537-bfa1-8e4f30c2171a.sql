ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS card_number_enc text,
  ADD COLUMN IF NOT EXISTS card_bin text;