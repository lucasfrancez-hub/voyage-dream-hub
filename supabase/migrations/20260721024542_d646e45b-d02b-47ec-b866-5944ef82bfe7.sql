ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS monde_sale_id text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_monde_sale_id_key ON public.orders(monde_sale_id) WHERE monde_sale_id IS NOT NULL;