UPDATE public.wa_messages
SET message_type = CASE
  WHEN card_option IS NOT NULL OR (quote_id IS NOT NULL AND option_index IS NOT NULL) THEN 'card'
  WHEN content LIKE '[[media:audio|%' OR media_type ILIKE 'audio%' THEN 'audio'
  WHEN content LIKE '[[media:image|%' OR media_type ILIKE 'image%' THEN 'image'
  WHEN content LIKE '[[media:video|%' OR media_type ILIKE 'video%' THEN 'video'
  WHEN content LIKE '[[media:document|%' OR media_type IS NOT NULL THEN 'document'
  ELSE 'text'
END
WHERE message_type IS NULL OR message_type = 'text';

UPDATE public.wa_messages
SET transcricao = NULLIF(btrim(split_part(content, '🎤 [áudio transcrito] ', 2)), '')
WHERE transcricao IS NULL AND content LIKE '%🎤 [áudio transcrito] %';

UPDATE public.wa_messages
SET product_type = 'flight'
WHERE product_type IS NULL AND quote_id IS NOT NULL;