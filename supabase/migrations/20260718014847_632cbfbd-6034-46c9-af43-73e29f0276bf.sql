ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_person_id ON public.orders(person_id);