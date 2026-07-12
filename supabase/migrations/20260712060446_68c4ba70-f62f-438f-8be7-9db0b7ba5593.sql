CREATE OR REPLACE FUNCTION public.materialize_order_from_snapshot(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  pkg public.packages%ROWTYPE;
  snap jsonb;
  outbound jsonb;
  ret jsonb;
  hotel_name text;
  hotel_stars jsonb;
  nights jsonb;
  meal_plan text;
  destination text;
  going_date text;
  return_date text;
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

  -- Load package as fallback
  IF o.package_id IS NOT NULL THEN
    SELECT * INTO pkg FROM public.packages WHERE id = o.package_id;
  END IF;

  outbound := COALESCE(snap->'outbound_flight', pkg.outbound_flight);
  ret := COALESCE(snap->'return_flight', pkg.return_flight);
  hotel_name := COALESCE(snap->>'hotel_name', pkg.hotel_name);
  hotel_stars := COALESCE(snap->'hotel_stars', to_jsonb(pkg.hotel_stars));
  nights := COALESCE(snap->'nights', to_jsonb(pkg.nights));
  meal_plan := COALESCE(snap->>'meal_plan', pkg.meal_plan);
  destination := COALESCE(snap->>'destination', pkg.destination);
  going_date := COALESCE(snap->>'going_date', pkg.going_date::text);
  return_date := COALESCE(snap->>'return_date', pkg.return_date::text);

  next_sort := 0;

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

  IF hotel_name IS NOT NULL AND hotel_name <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = _order_id AND kind='hotel') THEN
      INSERT INTO public.order_items(order_id, kind, status, title, supplier_locator, details, sort_order)
      VALUES (
        _order_id, 'hotel', 'pending',
        hotel_name || CASE WHEN nights IS NOT NULL THEN ' — ' || (nights#>>'{}') || ' noites' ELSE '' END,
        NULL,
        jsonb_build_object(
          'hotel_name', hotel_name,
          'hotel_stars', hotel_stars,
          'nights', nights,
          'meal_plan', meal_plan,
          'destination', destination,
          'check_in', going_date,
          'check_out', return_date
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
        WHEN 'child' THEN 'CHD' WHEN 'chd' THEN 'CHD'
        WHEN 'infant' THEN 'INF' WHEN 'inf' THEN 'INF'
        ELSE 'ADT' END;
      IF NOT EXISTS (SELECT 1 FROM public.order_passengers WHERE order_id = _order_id AND sort_order = idx) THEN
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

REVOKE EXECUTE ON FUNCTION public.materialize_order_from_snapshot(uuid) FROM PUBLIC, anon, authenticated;

-- Re-run backfill now with fallback logic
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders LOOP
    PERFORM public.materialize_order_from_snapshot(r.id);
  END LOOP;
END $$;