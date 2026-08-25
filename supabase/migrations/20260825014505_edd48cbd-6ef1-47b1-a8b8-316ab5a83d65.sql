ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;

UPDATE public.orders
   SET is_lead = true
 WHERE is_lead = false
   AND (full_name = 'Lead do site (motor público)' OR notes LIKE 'PEDIDO GERADO PELO MOTOR DE BUSCA PÚBLICO%');

CREATE INDEX IF NOT EXISTS orders_is_lead_idx ON public.orders (is_lead, created_at DESC);