CREATE OR REPLACE FUNCTION public.materialize_order_from_snapshot(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  snap jsonb;
  outbound jsonb;
  ret jsonb;
  traveler jsonb;
  idx int;
  next_sort int;
  ptype text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN; END IF;

  snap := COALESCE(o.package_snapshot, '{}'::jsonb);

  IF snap ? 'kind' AND snap->>'kind' IN ('payment_link','payment_link_simple') THEN RETURN; END IF;
  IF (snap->>'manual')::boolean IS TRUE THEN RETURN; END IF;

  next_sort := 0;

  outbound := snap->'outbound_flight';
  IF outbound IS NOT NULL AND jsonb_typeof(outbound) = 'object' THEN
    IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = _order_id AND kind='flight' AND (details->>'direction')='outbound') THEN
      INSERT INTO public.order_items(order_id, kind, status, title, supplier_locator, details, sort_order)
      VALUES (
        _order_id, 'flight', 'pending',
        COALESCE(outbound->>'airline','Voo') || ' ' || COALESCE(outbound->>'flight_number','') || ' — ' ||
          COALESCE(outbound->>'from_iata','') || '→' || COALESCE(outbound->>'to_iata',''),
        NULLIF(o.airline_locator, ''),
        outbound || jsonb_build_object('direction','outbound'),
        next_sort
      );
      next_sort := next_sort + 1;
    END IF;
  END IF;

  ret := snap->'return_flight';
  IF ret IS NOT NULL AND jsonb_typeof(ret) = 'object' THEN
    IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = _order_id AND kind='flight' AND (details->>'direction')='return') THEN
      INSERT INTO public.order_items(order_id, kind, status, title, supplier_locator, details, sort_order)
      VALUES (
        _order_id, 'flight', 'pending',
        COALESCE(ret->>'airline','Voo') || ' ' || COALESCE(ret->>'flight_number','') || ' — ' ||
          COALESCE(ret->>'from_iata','') || '→' || COALESCE(ret->>'to_iata',''),
        NULLIF(o.airline_locator, ''),
        ret || jsonb_build_object('direction','return'),
        next_sort
      );
      next_sort := next_sort + 1;
    END IF;
  END IF;

  IF snap ? 'hotel_name' AND (snap->>'hotel_name') IS NOT NULL AND (snap->>'hotel_name') <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = _order_id AND kind='hotel') THEN
      INSERT INTO public.order_items(order_id, kind, status, title, supplier_locator, details, sort_order)
      VALUES (
        _order_id, 'hotel', 'pending',
        (snap->>'hotel_name') ||
          CASE WHEN snap ? 'nights' AND (snap->>'nights') IS NOT NULL
               THEN ' — ' || (snap->>'nights') || ' noites' ELSE '' END,
        NULL,
        jsonb_build_object(
          'hotel_name', snap->>'hotel_name',
          'hotel_stars', snap->'hotel_stars',
          'nights', snap->'nights',
          'meal_plan', snap->>'meal_plan',
          'destination', snap->>'destination',
          'check_in', snap->>'going_date',
          'check_out', snap->>'return_date'
        ),
        next_sort
      );
      next_sort := next_sort + 1;
    END IF;
  END IF;

  IF snap ? 'travelers' AND jsonb_typeof(snap->'travelers') = 'array' THEN
    idx := 0;
    FOR traveler IN SELECT * FROM jsonb_array_elements(snap->'travelers')
    LOOP
      ptype := CASE lower(COALESCE(traveler->>'kind','adult'))
        WHEN 'child' THEN 'CHD'
        WHEN 'chd' THEN 'CHD'
        WHEN 'infant' THEN 'INF'
        WHEN 'inf' THEN 'INF'
        ELSE 'ADT'
      END;
      IF NOT EXISTS (
        SELECT 1 FROM public.order_passengers
        WHERE order_id = _order_id AND sort_order = idx
      ) THEN
        INSERT INTO public.order_passengers(order_id, full_name, passenger_type, birth_date, cpf, sort_order)
        VALUES (
          _order_id,
          COALESCE(traveler->>'full_name','Passageiro ' || (idx+1)),
          ptype,
          NULLIF(traveler->>'birth_date','')::date,
          NULLIF(traveler->>'cpf',''),
          idx
        );
      END IF;
      idx := idx + 1;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_orders_materialize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.materialize_order_from_snapshot(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_materialize_after_insert ON public.orders;
CREATE TRIGGER orders_materialize_after_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_materialize();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders LOOP
    PERFORM public.materialize_order_from_snapshot(r.id);
  END LOOP;
END $$;