-- Espelha conversas/DMs do Instagram já existentes no inbox do chat
INSERT INTO public.wa_conversations (wa_phone, display_name, last_message_at, last_message_preview, unread_count, meta)
SELECT 'ig:' || ic.contact_ig_id,
       COALESCE(ic.contact_username, 'Instagram ' || right(ic.contact_ig_id, 6)),
       COALESCE(ic.last_message_at, now()),
       ic.last_message_preview,
       COALESCE(ic.unread_count, 0),
       jsonb_build_object('channel','instagram','ig_account_id', ic.account_id, 'ig_conversation_id', ic.id, 'ig_contact_id', ic.contact_ig_id)
FROM public.instagram_conversations ic
WHERE NOT EXISTS (SELECT 1 FROM public.wa_conversations w WHERE w.wa_phone = 'ig:' || ic.contact_ig_id);

INSERT INTO public.wa_messages (conversation_id, direction, sender, content, wa_message_id, message_type, created_at)
SELECT w.id,
       im.direction,
       CASE WHEN im.direction = 'inbound' THEN 'customer' ELSE 'human' END,
       COALESCE(im.text, '[mídia do Instagram]'),
       im.ig_message_id,
       COALESCE(im.message_type, 'text'),
       im.created_at
FROM public.instagram_messages im
JOIN public.instagram_conversations ic ON ic.id = im.conversation_id
JOIN public.wa_conversations w ON w.wa_phone = 'ig:' || ic.contact_ig_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.wa_messages m
  WHERE m.conversation_id = w.id AND m.wa_message_id IS NOT DISTINCT FROM im.ig_message_id AND im.ig_message_id IS NOT NULL
);