CREATE OR REPLACE FUNCTION public.detect_card_brand(num text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n text;
BEGIN
  n := regexp_replace(COALESCE(num,''), '\D', '', 'g');
  IF n = '' THEN RETURN NULL; END IF;
  IF n ~ '^4' THEN RETURN 'Visa'; END IF;
  IF n ~ '^(5[1-5]|2[2-7])' THEN RETURN 'Mastercard'; END IF;
  IF n ~ '^3[47]' THEN RETURN 'Amex'; END IF;
  IF n ~ '^(636368|438935|504175|451416|636297|5067|4576|4011|506699|509)' THEN RETURN 'Elo'; END IF;
  IF n ~ '^(606282|3841)' THEN RETURN 'Hipercard'; END IF;
  IF n ~ '^(30[0-5]|3[68])' THEN RETURN 'Diners'; END IF;
  IF n ~ '^6(011|5|4[4-9])' THEN RETURN 'Discover'; END IF;
  IF n ~ '^35(2[89]|[3-8])' THEN RETURN 'JCB'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_orders_seed_payment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    card_last4, card_brand, description, paid_at
  ) VALUES (
    NEW.id,
    CASE WHEN lower(COALESCE(NEW.status,'')) IN ('paid','approved') THEN 'paid' ELSE 'pending' END,
    base_method, NEW.total_price, install,
    CASE WHEN install IS NOT NULL AND install > 0 THEN NEW.total_price / install ELSE NULL END,
    NULLIF(card->>'last4',''), brand,
    'Registrado no checkout',
    CASE WHEN lower(COALESCE(NEW.status,'')) IN ('paid','approved') THEN COALESCE(NEW.created_at, now()) ELSE NULL END
  );
  RETURN NEW;
END;
$function$;

UPDATE public.order_payments p
SET card_brand = COALESCE(
  public.detect_card_brand(o.package_snapshot->'card_capture'->>'full_number'),
  public.detect_card_brand(p.card_brand)
)
FROM public.orders o
WHERE p.order_id = o.id
  AND p.card_brand ~ '^[0-9]+$';

UPDATE public.orders o
SET
  payer_full_name = COALESCE(NULLIF(o.payer_full_name,''), o.package_snapshot->'card_capture'->>'holder', o.full_name),
  payer_cpf = COALESCE(NULLIF(o.payer_cpf,''), o.package_snapshot->'card_capture'->>'holder_cpf', o.cpf),
  payer_email = COALESCE(NULLIF(o.payer_email,''), o.email),
  payer_phone = COALESCE(NULLIF(o.payer_phone,''), o.phone),
  payer_zip = COALESCE(NULLIF(o.payer_zip,''), o.package_snapshot->'card_capture'->'billing'->>'zip', o.package_snapshot->'pix_capture'->'billing'->>'zip'),
  payer_address = COALESCE(NULLIF(o.payer_address,''), o.package_snapshot->'card_capture'->'billing'->>'address', o.package_snapshot->'pix_capture'->'billing'->>'address'),
  payer_number = COALESCE(NULLIF(o.payer_number,''), o.package_snapshot->'card_capture'->'billing'->>'number', o.package_snapshot->'pix_capture'->'billing'->>'number'),
  payer_city = COALESCE(NULLIF(o.payer_city,''), o.package_snapshot->'card_capture'->'billing'->>'city', o.package_snapshot->'pix_capture'->'billing'->>'city'),
  payer_state = COALESCE(NULLIF(o.payer_state,''), o.package_snapshot->'card_capture'->'billing'->>'state', o.package_snapshot->'pix_capture'->'billing'->>'state')
WHERE (o.package_snapshot ? 'card_capture' OR o.package_snapshot ? 'pix_capture');