
WITH segs AS (
  SELECT oi.order_id,
         upper(coalesce(oi.details->>'origin', oi.details->>'from', oi.details->>'origin_code', oi.details->>'from_iata','')) AS orig,
         upper(coalesce(oi.details->>'destination', oi.details->>'to', oi.details->>'destination_code', oi.details->>'to_iata','')) AS dest,
         coalesce(oi.supplier_locator,'') AS loc,
         COALESCE(NULLIF(oi.details->>'segment_index','')::int, NULLIF(oi.details->>'order','')::int, 0) AS ord,
         coalesce(oi.details->>'depart_at', oi.details->>'departure_at','') AS depart,
         oi.created_at, oi.id
    FROM order_items oi
   WHERE oi.kind='flight' AND coalesce(oi.status,'') <> 'cancelled'
),
ranked AS (
  SELECT s.*, row_number() OVER (PARTITION BY order_id ORDER BY loc, depart, ord, created_at, id) AS rn,
         count(*) OVER (PARTITION BY order_id) AS cnt
    FROM segs s
   WHERE s.orig <> '' AND s.dest <> ''
),
endpoints AS (
  SELECT order_id,
         max(CASE WHEN rn=1 THEN orig END) AS first_orig,
         max(CASE WHEN rn=cnt THEN dest END) AS last_dest,
         max(CASE WHEN rn = GREATEST(1, cnt/2) THEN dest END) AS turnaround,
         cnt
    FROM ranked
   GROUP BY order_id, cnt
),
flight_title AS (
  SELECT e.order_id,
         CASE
           WHEN e.first_orig = e.last_dest AND e.cnt > 1 THEN
             'Aéreo ' || public._iata_city(e.first_orig) || ' ⇄ ' || public._iata_city(coalesce(e.turnaround, e.first_orig))
           ELSE
             'Aéreo ' || public._iata_city(e.first_orig) || ' → ' || public._iata_city(e.last_dest)
         END AS title
    FROM endpoints e
),
hotel_title AS (
  SELECT DISTINCT ON (order_id) order_id,
         CASE WHEN coalesce(title,'') <> '' THEN 'Hospedagem ' || title ELSE 'Hospedagem' END AS title
    FROM order_items
   WHERE kind='hotel' AND coalesce(status,'') <> 'cancelled'
   ORDER BY order_id, created_at
),
other_title AS (
  SELECT DISTINCT ON (order_id) order_id,
         coalesce(NULLIF(title,''),'Serviços') AS title
    FROM order_items
   WHERE kind NOT IN ('flight','hotel') AND coalesce(status,'') <> 'cancelled'
   ORDER BY order_id, created_at
),
combined AS (
  SELECT o.id AS order_id,
         array_remove(ARRAY[f.title, h.title, ot.title], NULL) AS parts
    FROM orders o
    LEFT JOIN flight_title f ON f.order_id = o.id
    LEFT JOIN hotel_title  h ON h.order_id = o.id
    LEFT JOIN other_title  ot ON ot.order_id = o.id
   WHERE (o.package_snapshot->>'auto_title')::boolean IS TRUE
)
UPDATE orders o
   SET package_snapshot = jsonb_set(
         coalesce(o.package_snapshot,'{}'::jsonb),
         '{title}',
         to_jsonb(substr(array_to_string(c.parts, ' + '), 1, 140))
       )
  FROM combined c
 WHERE o.id = c.order_id AND array_length(c.parts,1) > 0;
