ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;
CREATE INDEX IF NOT EXISTS orders_deleted_at_idx ON public.orders (deleted_at);