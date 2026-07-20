WITH loc_map AS (
  SELECT
    op.id AS passenger_id,
    COALESCE(
      jsonb_object_agg(
        UPPER(TRIM(oi.supplier_locator)),
        op.ticket_number
      ) FILTER (WHERE oi.supplier_locator IS NOT NULL AND TRIM(oi.supplier_locator) <> ''),
      jsonb_build_object('_', op.ticket_number)
    ) AS new_tickets
  FROM public.order_passengers op
  LEFT JOIN public.order_items oi
    ON oi.order_id = op.order_id AND oi.kind = 'flight'
  WHERE op.ticket_number IS NOT NULL
    AND TRIM(op.ticket_number) <> ''
    AND (op.tickets IS NULL OR op.tickets = '{}'::jsonb)
  GROUP BY op.id, op.ticket_number
)
UPDATE public.order_passengers op
SET tickets = lm.new_tickets
FROM loc_map lm
WHERE op.id = lm.passenger_id;