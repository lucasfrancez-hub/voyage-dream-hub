
-- Backfill de airline_checkin_url para voos LA/G3/AD já cadastrados.
-- Regra idêntica ao helper `buildAirlineCheckinUrl` do front:
--   LATAM: orderId + lastname
--   Gol:   codigoReserva + origem + sobrenome
--   Azul:  pnr + origin
WITH prefix AS (
  SELECT
    oi.id,
    oi.order_id,
    oi.supplier_locator,
    oi.details,
    UPPER(COALESCE(
      NULLIF(oi.details->>'airline_iata',''),
      substring(UPPER(COALESCE(oi.details->>'flight_number','')) from '^([A-Z]{1,2}[0-9]?|[0-9][A-Z])')
    )) AS airline,
    UPPER(COALESCE(NULLIF(oi.supplier_locator,''), NULLIF(oi.details->>'carrier_locator',''))) AS loc,
    UPPER(COALESCE(NULLIF(oi.details->>'from_iata',''), NULLIF(oi.details->>'origin',''))) AS origin,
    UPPER(COALESCE(NULLIF(oi.details#>>'{pricing_summary,order_number}',''), '')) AS order_num
  FROM public.order_items oi
  WHERE oi.kind = 'flight'
),
holder AS (
  SELECT DISTINCT ON (order_id)
    order_id,
    UPPER(regexp_replace(trim(full_name), '.*\s+', '')) AS last_name
  FROM public.order_passengers
  ORDER BY order_id, sort_order NULLS LAST, created_at
),
calc AS (
  SELECT
    p.id,
    p.details,
    CASE
      WHEN p.airline = 'LA' AND COALESCE(NULLIF(p.order_num,''), p.loc) IS NOT NULL AND h.last_name IS NOT NULL
        THEN 'https://www.latamairlines.com/br/pt/minhas-viagens/second-detail/?orderId='
             || COALESCE(NULLIF(p.order_num,''), p.loc)
             || '&lastname=' || h.last_name
      WHEN p.airline = 'G3' AND p.loc IS NOT NULL AND p.origin IS NOT NULL AND h.last_name IS NOT NULL
        THEN 'https://www.voegol.com.br/minhas-viagens?codigoReserva='
             || p.loc || '&origem=' || p.origin || '&sobrenome=' || h.last_name
      WHEN p.airline = 'AD' AND p.loc IS NOT NULL AND p.origin IS NOT NULL
        THEN 'https://www.voeazul.com.br/br/pt/home/minhas-viagens/confirmacao?pnr='
             || p.loc || '&origin=' || p.origin
      ELSE NULL
    END AS new_url
  FROM prefix p
  LEFT JOIN holder h ON h.order_id = p.order_id
  WHERE p.airline IN ('LA','G3','AD')
)
UPDATE public.order_items oi
SET details = jsonb_set(oi.details, '{airline_checkin_url}', to_jsonb(c.new_url), true)
FROM calc c
WHERE c.id = oi.id
  AND c.new_url IS NOT NULL
  AND (oi.details->>'airline_checkin_url' IS DISTINCT FROM c.new_url);
