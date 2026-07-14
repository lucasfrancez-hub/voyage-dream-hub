
-- Helper: strip airline_logo_url from a flight jsonb (top-level + each segment)
CREATE OR REPLACE FUNCTION public._strip_airline_logo(f jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  out_f jsonb := f;
  segs jsonb;
  new_segs jsonb;
  seg jsonb;
BEGIN
  IF out_f IS NULL THEN RETURN NULL; END IF;
  out_f := out_f - 'airline_logo_url';
  segs := out_f->'segments';
  IF jsonb_typeof(segs) = 'array' THEN
    new_segs := '[]'::jsonb;
    FOR seg IN SELECT * FROM jsonb_array_elements(segs) LOOP
      new_segs := new_segs || jsonb_build_array(seg - 'airline_logo_url');
    END LOOP;
    out_f := jsonb_set(out_f, '{segments}', new_segs);
  END IF;
  RETURN out_f;
END;
$$;

-- Clear from order_items.details (aéreo)
UPDATE public.order_items
SET details = public._strip_airline_logo(details)
WHERE details IS NOT NULL
  AND (
    (details ? 'airline_logo_url')
    OR (jsonb_typeof(details->'segments') = 'array'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(details->'segments') s WHERE s ? 'airline_logo_url'))
  );

-- Clear from packages.outbound_flight and packages.return_flight
UPDATE public.packages
SET outbound_flight = public._strip_airline_logo(outbound_flight)
WHERE outbound_flight IS NOT NULL;

UPDATE public.packages
SET return_flight = public._strip_airline_logo(return_flight)
WHERE return_flight IS NOT NULL;

DROP FUNCTION public._strip_airline_logo(jsonb);
