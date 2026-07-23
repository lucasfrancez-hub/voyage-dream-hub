
ALTER TABLE public.wa_broadcast_destinos DROP CONSTRAINT IF EXISTS wa_broadcast_destinos_tipo_check;
ALTER TABLE public.wa_broadcast_destinos ADD CONSTRAINT wa_broadcast_destinos_tipo_check
  CHECK (tipo = ANY (ARRAY['channel'::text, 'group'::text, 'instagram_story'::text]));

INSERT INTO public.wa_broadcast_destinos (jid, tipo, nome, foto_url, ativo, pode_postar, is_admin)
SELECT
  'ig_story:' || ia.ig_user_id,
  'instagram_story',
  '📸 Story — @' || ia.username,
  ia.profile_picture_url,
  true, true, true
FROM public.instagram_accounts ia
WHERE ia.active = true
ON CONFLICT (jid) DO NOTHING;
