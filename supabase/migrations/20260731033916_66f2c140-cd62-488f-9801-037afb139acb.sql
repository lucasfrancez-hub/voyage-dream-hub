WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY conversation_id ORDER BY opened_at DESC, created_at DESC, id DESC) AS rn
  FROM public.wa_protocolos
  WHERE status = 'aberto'
)
UPDATE public.wa_protocolos p
SET status = 'encerrado_manual', closed_at = now()
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS wa_protocolos_one_open_per_conversation
ON public.wa_protocolos (conversation_id)
WHERE status = 'aberto';

ALTER TABLE public.wa_flight_quotes
ADD COLUMN IF NOT EXISTS protocolo_id uuid REFERENCES public.wa_protocolos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wa_flight_quotes_protocolo_created_idx
ON public.wa_flight_quotes (protocolo_id, created_at DESC);