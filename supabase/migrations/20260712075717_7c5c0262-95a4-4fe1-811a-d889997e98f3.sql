
CREATE OR REPLACE FUNCTION public.trg_orders_seed_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap jsonb;
  raw_method text;
  base_method text;
  install int;
  card jsonb;
BEGIN
  snap := COALESCE(NEW.package_snapshot, '{}'::jsonb);

  -- Skip payment links and manual orders (admin-managed)
  IF snap ? 'kind' AND snap->>'kind' IN ('payment_link','payment_link_simple') THEN
    RETURN NEW;
  END IF;
  IF (snap->>'manual')::boolean IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Need a method and amount to seed a payment row
  IF NEW.payment_method IS NULL OR NEW.total_price IS NULL OR NEW.total_price <= 0 THEN
    RETURN NEW;
  END IF;

  -- Avoid duplicates if a payment was somehow already created
  IF EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  raw_method := NEW.payment_method;
  install := NULL;

  IF raw_method LIKE 'credit_card%' THEN
    base_method := 'credit_card';
    install := NULLIF(regexp_replace(raw_method, '\D', '', 'g'), '')::int;
  ELSIF raw_method LIKE 'boleto%' THEN
    base_method := 'boleto';
    install := NULLIF(regexp_replace(raw_method, '\D', '', 'g'), '')::int;
  ELSE
    base_method := raw_method;
  END IF;

  card := snap->'card_capture';

  INSERT INTO public.order_payments(
    order_id, status, method, amount, installments, installment_amount,
    card_last4, card_brand, description
  ) VALUES (
    NEW.id,
    'pending',
    base_method,
    NEW.total_price,
    install,
    CASE WHEN install IS NOT NULL AND install > 0 THEN NEW.total_price / install ELSE NULL END,
    NULLIF(card->>'last4',''),
    NULLIF(card->>'brand_hint',''),
    'Registrado no checkout'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_seed_payment ON public.orders;
CREATE TRIGGER orders_seed_payment
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_seed_payment();
