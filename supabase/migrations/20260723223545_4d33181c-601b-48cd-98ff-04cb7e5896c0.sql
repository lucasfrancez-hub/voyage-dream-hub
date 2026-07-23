INSERT INTO public.wa_broadcast_destinos (jid, tipo, nome, ativo, pode_postar, is_admin)
VALUES ('ig_story:27551534044489283', 'instagram_story', '@viaairs (Stories)', true, true, true)
ON CONFLICT DO NOTHING;