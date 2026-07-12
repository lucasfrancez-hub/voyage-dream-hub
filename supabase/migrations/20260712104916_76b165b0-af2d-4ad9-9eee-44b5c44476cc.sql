CREATE OR REPLACE FUNCTION public.trg_orders_seed_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  snap jsonb; raw_method text; base_method text; install int; card jsonb;
  brand text; hint text;
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
  hint := NULLIF(card->>'brand_hint','');
  brand := COALESCE(
    public.detect_card_brand(card->>'full_number'),
    CASE WHEN hint ~ '^[0-9]+$' THEN public.detect_card_brand(hint) ELSE hint END
  );

  INSERT INTO public.order_payments(
    order_id, status, method, amount, installments, installment_amount,
    card_last4, card_brand, description, paid_at, added_by_name
  ) VALUES (
    NEW.id,
    CASE WHEN lower(COALESCE(NEW.status,'')) IN ('paid','approved') THEN 'paid' ELSE 'pending' END,
    base_method, NEW.total_price, install,
    CASE WHEN install IS NOT NULL AND install > 0 THEN NEW.total_price / install ELSE NULL END,
    NULLIF(card->>'last4',''), brand,
    'Registrado no checkout',
    CASE WHEN lower(COALESCE(NEW.status,'')) IN ('paid','approved') THEN COALESCE(NEW.created_at, now()) ELSE NULL END,
    NEW.full_name
  );
  RETURN NEW;
END;
$function$;