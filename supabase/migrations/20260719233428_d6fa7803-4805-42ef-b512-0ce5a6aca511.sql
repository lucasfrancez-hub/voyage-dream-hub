UPDATE public.flight_checkins fc
SET departure_at = COALESCE(
  (oi.details->>'depart_at')::timestamptz,
  (oi.details->>'departure_at')::timestamptz
)
FROM public.order_items oi
WHERE fc.order_item_id = oi.id
  AND fc.departure_at IS NULL
  AND COALESCE(oi.details->>'depart_at', oi.details->>'departure_at') IS NOT NULL;