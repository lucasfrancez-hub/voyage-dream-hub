ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.wa_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_type text,
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS transcricao text,
  ADD COLUMN IF NOT EXISTS resumo text;

CREATE INDEX IF NOT EXISTS wa_messages_reply_to_message_id_idx
  ON public.wa_messages (reply_to_message_id);
CREATE INDEX IF NOT EXISTS wa_messages_wa_message_id_idx
  ON public.wa_messages (wa_message_id);
CREATE INDEX IF NOT EXISTS wa_messages_reply_to_wa_id_idx
  ON public.wa_messages (reply_to_wa_id);

-- Backfill do vínculo interno a partir do id da Meta
UPDATE public.wa_messages m
SET reply_to_message_id = o.id
FROM public.wa_messages o
WHERE m.reply_to_message_id IS NULL
  AND m.reply_to_wa_id IS NOT NULL
  AND o.wa_message_id = m.reply_to_wa_id
  AND o.conversation_id = m.conversation_id;

-- Classificação retroativa de tipo de mensagem
UPDATE public.wa_messages
SET message_type = CASE
  WHEN card_option IS NOT NULL OR (quote_id IS NOT NULL AND option_index IS NOT NULL) THEN 'card'
  WHEN media_type ILIKE 'audio%' THEN 'audio'
  WHEN media_type ILIKE 'image%' THEN 'image'
  WHEN media_type ILIKE 'video%' THEN 'video'
  WHEN media_type IS NOT NULL THEN 'document'
  ELSE 'text'
END
WHERE message_type IS NULL;

-- Produto: por enquanto só o aéreo é inferível com segurança
UPDATE public.wa_messages
SET product_type = 'flight'
WHERE product_type IS NULL AND quote_id IS NOT NULL;

COMMENT ON COLUMN public.wa_messages.reply_to_message_id IS 'FK interna para a mensagem citada (botão Responder do WhatsApp). Complementa reply_to_wa_id, que é o id da Meta.';
COMMENT ON COLUMN public.wa_messages.message_type IS 'text | image | card | fallback | audio | document | video | location | contact | sticker | button';
COMMENT ON COLUMN public.wa_messages.product_type IS 'flight | package | hotel | transfer | insurance | order | tour | cruise';