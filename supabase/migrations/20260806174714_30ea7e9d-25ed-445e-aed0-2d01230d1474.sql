UPDATE public.instagram_accounts
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"ai_enabled": false, "ai_reels_only": true}'::jsonb
WHERE lower(username) = 'lucasfrancez';