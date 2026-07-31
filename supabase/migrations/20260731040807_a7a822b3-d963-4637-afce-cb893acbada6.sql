-- Encerra protocolos "órfãos" (abertos, mas que a conversa não aponta mais
-- como ativo e que já foram sucedidos por outro protocolo). Eles travavam a
-- abertura de novos atendimentos.
UPDATE public.wa_protocolos p
SET status = 'encerrado_inatividade', closed_at = now()
WHERE p.status = 'aberto'
  AND NOT EXISTS (
    SELECT 1 FROM public.wa_conversations c
    WHERE c.id = p.conversation_id AND c.protocolo_ativo_id = p.id
  )
  AND EXISTS (
    SELECT 1 FROM public.wa_protocolos p2
    WHERE p2.conversation_id = p.conversation_id AND p2.opened_at > p.opened_at
  );