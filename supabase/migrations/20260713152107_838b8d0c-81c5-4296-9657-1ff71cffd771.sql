ALTER TABLE public.order_item_financials
  ADD COLUMN IF NOT EXISTS is_commissionable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rav_value numeric NOT NULL DEFAULT 0;