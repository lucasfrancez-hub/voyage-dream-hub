
UPDATE public.order_items
SET details = jsonb_set(
  details,
  '{airline_checkin_url}',
  to_jsonb(
    replace(
      details->>'airline_checkin_url',
      'https://www.voegol.com.br/minhas-viagens?',
      'https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem?'
    )
  ),
  true
)
WHERE kind = 'flight'
  AND details->>'airline_checkin_url' LIKE 'https://www.voegol.com.br/minhas-viagens?%';
