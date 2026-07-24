
UPDATE public.broadcast_suggestions
SET suggested_channels = ARRAY['channel']
WHERE status = 'pending' AND (reasoning ILIKE '%canal%' OR 'whatsapp' = ANY(suggested_channels)) AND reasoning NOT ILIKE '%grupo%';

UPDATE public.broadcast_suggestions
SET suggested_channels = ARRAY['group']
WHERE status = 'pending' AND 'whatsapp' = ANY(suggested_channels);

UPDATE public.broadcast_suggestions
SET suggested_channels = ARRAY['instagram_story']
WHERE status = 'pending' AND 'instagram_feed' = ANY(suggested_channels);
