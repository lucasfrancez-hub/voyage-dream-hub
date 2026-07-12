ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS travel_reason text,
  ADD COLUMN IF NOT EXISTS coupon text;