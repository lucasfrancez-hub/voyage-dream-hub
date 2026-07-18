
CREATE OR REPLACE FUNCTION public._iata_city(code text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((
    SELECT c FROM (VALUES
      ('GRU','São Paulo'),('CGH','São Paulo'),('VCP','Campinas'),
      ('GIG','Rio de Janeiro'),('SDU','Rio de Janeiro'),
      ('BSB','Brasília'),('CNF','Belo Horizonte'),('PLU','Belo Horizonte'),
      ('CWB','Curitiba'),('POA','Porto Alegre'),('FLN','Florianópolis'),
      ('SSA','Salvador'),('REC','Recife'),('FOR','Fortaleza'),('NAT','Natal'),
      ('MCZ','Maceió'),('AJU','Aracaju'),('THE','Teresina'),('SLZ','São Luís'),
      ('BEL','Belém'),('MAO','Manaus'),('MGF','Maringá'),('LDB','Londrina'),
      ('CGB','Cuiabá'),('CGR','Campo Grande'),('GYN','Goiânia'),('VIX','Vitória'),
      ('IGU','Foz do Iguaçu'),('NVT','Navegantes'),('JPA','João Pessoa'),
      ('PMW','Palmas'),('MCP','Macapá'),('PVH','Porto Velho'),('RBR','Rio Branco'),
      ('BVB','Boa Vista'),('STM','Santarém'),
      ('MIA','Miami'),('MCO','Orlando'),('JFK','Nova York'),('LGA','Nova York'),('EWR','Newark'),
      ('LAX','Los Angeles'),('SFO','São Francisco'),('ORD','Chicago'),('IAH','Houston'),
      ('DFW','Dallas'),('ATL','Atlanta'),('BOS','Boston'),('LAS','Las Vegas'),
      ('LIS','Lisboa'),('OPO','Porto'),('MAD','Madri'),('BCN','Barcelona'),
      ('CDG','Paris'),('ORY','Paris'),('LHR','Londres'),('LGW','Londres'),
      ('FCO','Roma'),('MXP','Milão'),('FRA','Frankfurt'),('MUC','Munique'),
      ('AMS','Amsterdã'),('ZRH','Zurique'),('GVA','Genebra'),
      ('EZE','Buenos Aires'),('AEP','Buenos Aires'),('SCL','Santiago'),('LIM','Lima'),
      ('BOG','Bogotá'),('MEX','Cidade do México'),('CUN','Cancún'),
      ('DXB','Dubai'),('DOH','Doha'),('IST','Istambul')
    ) AS m(k,c) WHERE k = upper(trim(code))
  ), upper(trim(code)));
$$;

WITH segs AS (
  SELECT oi.order_id,
         upper(coalesce(oi.details->>'origin', oi.details->>'from', oi.details->>'origin_code','')) AS orig,
         upper(coalesce(oi.details->>'destination', oi.details->>'to', oi.details->>'destination_code','')) AS dest,
         coalesce(oi.supplier_locator,'') AS loc,
         COALESCE(NULLIF(oi.details->>'segment_index','')::int, NULLIF(oi.details->>'order','')::int, 0) AS ord,
         oi.created_at, oi.id
    FROM order_items oi
   WHERE oi.kind='flight' AND coalesce(oi.status,'') <> 'cancelled'
),
ranked AS (
  SELECT s.*, row_number() OVER (PARTITION BY order_id ORDER BY loc, ord, created_at, id) AS rn,
         count(*) OVER (PARTITION BY order_id) AS cnt
    FROM segs s
   WHERE s.orig <> '' AND s.dest <> ''
),
endpoints AS (
  SELECT order_id,
         max(CASE WHEN rn=1 THEN orig END) AS first_orig,
         max(CASE WHEN rn=cnt THEN dest END) AS last_dest,
         cnt
    FROM ranked
   GROUP BY order_id, cnt
),
turnaround AS (
  SELECT r.order_id, r.dest AS city, count(*) AS c
    FROM ranked r JOIN endpoints e USING(order_id)
   WHERE r.rn < e.cnt AND r.dest <> e.first_orig
   GROUP BY r.order_id, r.dest
),
turn_best AS (
  SELECT DISTINCT ON (order_id) order_id, city
    FROM turnaround
   ORDER BY order_id, c DESC, city
),
flight_title AS (
  SELECT e.order_id,
         CASE
           WHEN e.first_orig = e.last_dest AND e.cnt > 1 THEN
             'Aéreo ' || public._iata_city(e.first_orig) || ' ⇄ ' || public._iata_city(coalesce(t.city, e.first_orig))
           ELSE
             'Aéreo ' || public._iata_city(e.first_orig) || ' → ' || public._iata_city(e.last_dest)
         END AS title
    FROM endpoints e LEFT JOIN turn_best t USING (order_id)
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
