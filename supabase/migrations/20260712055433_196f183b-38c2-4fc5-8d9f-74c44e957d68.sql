
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS varchar
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n varchar(8);
BEGIN
  LOOP
    n := lpad((floor(random() * 100000000))::int::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = n);
  END LOOP;
  RETURN n;
END;
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number varchar(8);

UPDATE public.orders
  SET order_number = public.generate_order_number()
  WHERE order_number IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN order_number SET NOT NULL,
  ALTER COLUMN order_number SET DEFAULT public.generate_order_number();

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key ON public.orders(order_number);
