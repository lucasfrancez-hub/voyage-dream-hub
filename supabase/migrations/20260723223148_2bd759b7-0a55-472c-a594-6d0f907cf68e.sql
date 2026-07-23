DO $$
DECLARE
  v_acc uuid; v_conv1 uuid; v_conv2 uuid; v_conv3 uuid; v_media1 uuid; v_media2 uuid;
BEGIN
  SELECT id INTO v_acc FROM public.instagram_accounts WHERE username='viaairs' LIMIT 1;

  INSERT INTO public.instagram_conversations (account_id, ig_thread_id, contact_ig_id, contact_username, contact_name, last_message_at, last_message_preview, unread_count, status) VALUES
    (v_acc, 'demo_thread_001', 'demo_ig_001', 'marianalopes', 'Mariana Lopes', now() - interval '2 minutes', 'Oi! Vi o pacote pra Cancún, ainda tem?', 2, 'open'),
    (v_acc, 'demo_thread_002', 'demo_ig_002', 'ricardo.trip', 'Ricardo Andrade', now() - interval '18 minutes', 'Consigo parcelar em 10x?', 1, 'open'),
    (v_acc, 'demo_thread_003', 'demo_ig_003', 'julianam',     'Juliana Martins', now() - interval '1 hour', 'Show, obrigada!', 0, 'open');

  SELECT id INTO v_conv1 FROM public.instagram_conversations WHERE ig_thread_id='demo_thread_001';
  SELECT id INTO v_conv2 FROM public.instagram_conversations WHERE ig_thread_id='demo_thread_002';
  SELECT id INTO v_conv3 FROM public.instagram_conversations WHERE ig_thread_id='demo_thread_003';

  INSERT INTO public.instagram_messages (conversation_id, ig_message_id, direction, message_type, text, status, created_at) VALUES
    (v_conv1, 'demo_msg_001a', 'inbound',  'text', 'Oi! Vi o pacote pra Cancún no story, ainda tem vaga?', 'delivered', now() - interval '5 minutes'),
    (v_conv1, 'demo_msg_001b', 'inbound',  'text', 'Somos 2 adultos, pretendemos viajar em março.', 'delivered', now() - interval '2 minutes'),
    (v_conv2, 'demo_msg_002a', 'inbound',  'text', 'Boa tarde! Sobre o pacote de Orlando…', 'delivered', now() - interval '25 minutes'),
    (v_conv2, 'demo_msg_002b', 'outbound', 'text', 'Boa tarde, Ricardo! Sim, ainda temos disponibilidade. Posso te mandar as datas?', 'delivered', now() - interval '22 minutes'),
    (v_conv2, 'demo_msg_002c', 'inbound',  'text', 'Consigo parcelar em 10x?', 'delivered', now() - interval '18 minutes'),
    (v_conv3, 'demo_msg_003a', 'inbound',  'text', 'Recebi o voucher, tudo certo!', 'delivered', now() - interval '90 minutes'),
    (v_conv3, 'demo_msg_003b', 'outbound', 'text', 'Ótima viagem, Juliana! Qualquer coisa é só chamar.', 'delivered', now() - interval '75 minutes'),
    (v_conv3, 'demo_msg_003c', 'inbound',  'text', 'Show, obrigada!', 'read', now() - interval '60 minutes');

  INSERT INTO public.instagram_media (account_id, media_type, caption, image_urls, status, permalink, published_at, created_by_name) VALUES
    (v_acc, 'feed_image', '✈️ Cancún 7 noites all inclusive a partir de R$ 4.899', ARRAY['https://images.unsplash.com/photo-1552074284-5e88ef1aef18'], 'published', 'https://instagram.com/p/demo_cancun', now() - interval '1 day', 'VIA AIR'),
    (v_acc, 'feed_image', '🏰 Orlando 8 dias com Universal + Disney', ARRAY['https://images.unsplash.com/photo-1597466599360-3b9775841aec'], 'published', 'https://instagram.com/p/demo_orlando', now() - interval '3 days', 'VIA AIR');

  SELECT id INTO v_media1 FROM public.instagram_media WHERE permalink='https://instagram.com/p/demo_cancun';
  SELECT id INTO v_media2 FROM public.instagram_media WHERE permalink='https://instagram.com/p/demo_orlando';

  INSERT INTO public.instagram_comments (account_id, media_id, media_permalink, comment_id, from_ig_id, from_username, text, created_at) VALUES
    (v_acc, v_media1, 'https://instagram.com/p/demo_cancun',  'demo_cmt_001', 'demo_c_001', 'paulofsantos', 'Quanto pra família de 4 pessoas em julho?', now() - interval '10 minutes'),
    (v_acc, v_media1, 'https://instagram.com/p/demo_cancun',  'demo_cmt_002', 'demo_c_002', 'carolinabsp',  'Inclui traslado do aeroporto?', now() - interval '35 minutes'),
    (v_acc, v_media2, 'https://instagram.com/p/demo_orlando', 'demo_cmt_003', 'demo_c_003', 'fabioviagens', 'Tem saída de Curitiba? 🙌', now() - interval '2 hours');
END $$;