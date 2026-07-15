GRANT SELECT, INSERT, UPDATE ON public.wa_protocolos TO authenticated;
GRANT ALL ON public.wa_protocolos TO service_role;
GRANT USAGE ON SEQUENCE public.wa_protocolo_seq TO authenticated, service_role;

-- Cria protocolo retroativo para as conversas existentes que ficaram sem
INSERT INTO public.wa_protocolos (conversation_id)
SELECT c.id FROM public.wa_conversations c
LEFT JOIN public.wa_protocolos p ON p.conversation_id = c.id
WHERE p.id IS NULL;

UPDATE public.wa_conversations c
SET protocolo_ativo_id = p.id
FROM public.wa_protocolos p
WHERE p.conversation_id = c.id
  AND p.status = 'aberto'
  AND c.protocolo_ativo_id IS NULL;