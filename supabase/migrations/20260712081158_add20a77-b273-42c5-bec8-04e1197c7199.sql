CREATE OR REPLACE FUNCTION public.trg_orders_seed_payment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  snap jsonb; raw_method text; base_method text; install int; card jsonb;
BEGIN
  snap := COALESCE(NEW.package_snapshot, '{}'::jsonb);
  IF snap ? 'kind' AND snap->>'kind' IN ('payment_link','payment_link_simple') THEN RETURN NEW; END IF;
  IF (snap->>'manual')::boolean IS TRUE THEN RETURN NEW; END IF;
  IF NEW.payment_method IS NULL OR NEW.total_price IS NULL OR NEW.total_price <= 0 THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = NEW.id) THEN RETURN NEW; END IF;

  raw_method := NEW.payment_method; install := NULL;
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
    card_last4, card_brand, description, paid_at
  ) VALUES (
    NEW.id,
    CASE WHEN lower(COALESCE(NEW.status,'')) IN ('paid','approved') THEN 'paid' ELSE 'pending' END,
    base_method, NEW.total_price, install,
    CASE WHEN install IS NOT NULL AND install > 0 THEN NEW.total_price / install ELSE NULL END,
    NULLIF(card->>'last4',''), NULLIF(card->>'brand_hint',''),
    'Registrado no checkout',
    CASE WHEN lower(COALESCE(NEW.status,'')) IN ('paid','approved') THEN COALESCE(NEW.created_at, now()) ELSE NULL END
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_seed_payment_update ON public.orders;
CREATE TRIGGER orders_seed_payment_update
AFTER UPDATE ON public.orders FOR EACH ROW
WHEN (NEW.payment_method IS NOT NULL AND NEW.total_price IS NOT NULL AND NEW.total_price > 0)
EXECUTE FUNCTION public.trg_orders_seed_payment();

INSERT INTO public.order_payments(
  order_id, status, method, amount, installments, installment_amount,
  card_last4, card_brand, description, paid_at
)
SELECT
  o.id,
  CASE WHEN lower(COALESCE(o.status,'')) IN ('paid','approved') THEN 'paid' ELSE 'pending' END,
  CASE
    WHEN o.payment_method LIKE 'credit_card%' THEN 'credit_card'
    WHEN o.payment_method LIKE 'boleto%' THEN 'boleto'
    ELSE o.payment_method
  END,
  o.total_price,
  NULLIF(regexp_replace(o.payment_method, '\D', '', 'g'), '')::int,
  CASE WHEN NULLIF(regexp_replace(o.payment_method, '\D', '', 'g'), '')::int IS NOT NULL
       THEN o.total_price / NULLIF(regexp_replace(o.payment_method, '\D', '', 'g'), '')::int
       ELSE NULL END,
  NULLIF(o.package_snapshot->'card_capture'->>'last4',''),
  NULLIF(o.package_snapshot->'card_capture'->>'brand_hint',''),
  'Registrado no checkout',
  CASE WHEN lower(COALESCE(o.status,'')) IN ('paid','approved') THEN COALESCE(o.created_at, now()) ELSE NULL END
FROM public.orders o
WHERE o.payment_method IS NOT NULL
  AND o.total_price IS NOT NULL AND o.total_price > 0
  AND NOT EXISTS (SELECT 1 FROM public.order_payments p WHERE p.order_id = o.id)
  AND COALESCE(o.package_snapshot->>'kind','') NOT IN ('payment_link','payment_link_simple')
  AND COALESCE((o.package_snapshot->>'manual')::boolean, false) = false;