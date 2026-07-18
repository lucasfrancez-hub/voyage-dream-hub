UPDATE public.order_items
SET supplier_locator = NULLIF(BTRIM(details->>'carrier_locator'), ''),
    updated_at = now()
WHERE kind = 'flight'
  AND NULLIF(BTRIM(details->>'carrier_locator'), '') IS NOT NULL
  AND supplier_locator IS DISTINCT FROM NULLIF(BTRIM(details->>'carrier_locator'), '');