ALTER TABLE public.wa_protocolos
  ADD COLUMN IF NOT EXISTS numero_pedido text,
  ADD COLUMN IF NOT EXISTS numero_reserva text;