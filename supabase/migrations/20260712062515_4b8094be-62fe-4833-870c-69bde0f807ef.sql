ALTER TABLE public.order_item_financials
  ADD COLUMN IF NOT EXISTS tax_value numeric(12,2) NOT NULL DEFAULT 0;